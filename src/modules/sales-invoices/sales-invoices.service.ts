import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { InvoiceLineItem } from '../../entities/invoice-line-item.entity';
import { InvoicePayment } from '../../entities/invoice-payment.entity';
import { CreditNoteApplication } from '../../entities/credit-note-application.entity';
import { NumberingSequenceType } from '../../entities/numbering-sequence.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { Customer } from '../customers/customer.entity';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { PaymentStatus } from '../../common/enums/payment-status.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { EmailService } from '../notifications/email.service';
import { ReportGeneratorService } from '../reports/report-generator.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SettingsService } from '../settings/settings.service';
import { VatTaxType } from '../../common/enums/vat-tax-type.enum';
import * as crypto from 'crypto';

@Injectable()
export class SalesInvoicesService {
  constructor(
    @InjectRepository(SalesInvoice)
    private readonly invoicesRepository: Repository<SalesInvoice>,
    @InjectRepository(InvoiceLineItem)
    private readonly lineItemsRepository: Repository<InvoiceLineItem>,
    @InjectRepository(InvoicePayment)
    private readonly paymentsRepository: Repository<InvoicePayment>,
    @InjectRepository(CreditNoteApplication)
    private readonly creditNoteApplicationsRepository: Repository<CreditNoteApplication>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,
    private readonly emailService: EmailService,
    private readonly reportGeneratorService: ReportGeneratorService,
    private readonly auditLogsService: AuditLogsService,
    private readonly settingsService: SettingsService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(organizationId: string, filters: any): Promise<SalesInvoice[]> {
    const query = this.invoicesRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.customer', 'customer')
      .leftJoinAndSelect('invoice.lineItems', 'lineItems')
      .leftJoinAndSelect('invoice.creditNoteApplications', 'creditNoteApplications')
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.is_deleted = false');

    if (filters.status) {
      query.andWhere('invoice.status = :status', { status: filters.status });
    }
    if (filters.paymentStatus) {
      query.andWhere('invoice.payment_status = :paymentStatus', {
        paymentStatus: filters.paymentStatus,
      });
    }
    if (filters.customerId) {
      query.andWhere('invoice.customer_id = :customerId', {
        customerId: filters.customerId,
      });
    }
    if (filters.startDate) {
      query.andWhere('invoice.invoice_date >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters.endDate) {
      query.andWhere('invoice.invoice_date <= :endDate', {
        endDate: filters.endDate,
      });
    }

    query.orderBy('invoice.invoice_date', 'DESC');
    return query.getMany();
  }

  async findById(organizationId: string, id: string): Promise<SalesInvoice> {
    const invoice = await this.invoicesRepository.findOne({
      where: { id, organization: { id: organizationId }, isDeleted: false },
      relations: [
        'organization',
        'customer',
        'lineItems',
        'payments',
        'creditNoteApplications',
      ],
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  /**
   * Find invoice by public token (for public viewing)
   */
  async findByPublicToken(token: string): Promise<SalesInvoice> {
    const invoice = await this.invoicesRepository.findOne({
      where: { publicToken: token, isDeleted: false },
      relations: ['customer', 'lineItems', 'organization'],
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  /**
   * CRITICAL FIX: Calculate outstanding balance correctly
   * Outstanding = totalAmount - paidAmount - appliedCreditNoteAmount
   * This ensures paidAmount only reflects actual money received
   */
  async calculateOutstandingBalance(
    invoiceId: string,
    organizationId: string,
  ): Promise<number> {
    const invoice = await this.invoicesRepository.findOne({
      where: { id: invoiceId, organization: { id: organizationId } },
    });

    if (!invoice) {
      return 0;
    }

    const totalAmount = parseFloat(invoice.totalAmount);
    const paidAmount = parseFloat(invoice.paidAmount || '0');

    // Get total applied credit notes
    const applications = await this.creditNoteApplicationsRepository.find({
      where: {
        invoice: { id: invoiceId },
        organization: { id: organizationId },
      },
    });

    const appliedCreditAmount = applications.reduce(
      (sum, app) => sum + parseFloat(app.appliedAmount),
      0,
    );

    // Outstanding = totalAmount - paidAmount - appliedCreditNoteAmount
    return Math.max(0, totalAmount - paidAmount - appliedCreditAmount);
  }

  /**
   * Check if all payments for an invoice are cash
   */
  private async areAllPaymentsCash(
    invoiceId: string,
    organizationId: string,
  ): Promise<boolean> {
    const payments = await this.paymentsRepository.find({
      where: {
        invoice: { id: invoiceId },
        organization: { id: organizationId },
      },
    });

    if (payments.length === 0) {
      return false;
    }

    // Check if all payments are cash
    return payments.every(
      (payment) => payment.paymentMethod === PaymentMethod.CASH,
    );
  }

  /**
   * Update payment status based on outstanding balance
   */
  async updatePaymentStatus(
    invoiceId: string,
    organizationId: string,
  ): Promise<void> {
    const outstanding = await this.calculateOutstandingBalance(
      invoiceId,
      organizationId,
    );
    const invoice = await this.invoicesRepository.findOne({
      where: { id: invoiceId, organization: { id: organizationId } },
    });

    if (!invoice) {
      return;
    }

    const paidAmount = parseFloat(invoice.paidAmount || '0');

    if (outstanding <= 0) {
      invoice.paymentStatus = PaymentStatus.PAID;
      // Check if all payments are cash
      const allPaymentsCash = await this.areAllPaymentsCash(
        invoiceId,
        organizationId,
      );
      invoice.status = allPaymentsCash
        ? InvoiceStatus.TAX_INVOICE_CASH_RECEIVED
        : InvoiceStatus.TAX_INVOICE_BANK_RECEIVED;
    } else if (paidAmount > 0) {
      invoice.paymentStatus = PaymentStatus.PARTIAL;
    } else {
      invoice.paymentStatus = PaymentStatus.UNPAID;
    }

    await this.invoicesRepository.save(invoice);
  }

  async create(
    organizationId: string,
    userId: string,
    dto: any, // CreateSalesInvoiceDto
  ): Promise<SalesInvoice> {
    const [organization, user] = await Promise.all([
      this.organizationsRepository.findOne({ where: { id: organizationId } }),
      this.usersRepository.findOne({ where: { id: userId } }),
    ]);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get numbering settings to check if manual entry is allowed
    const numberingSettings = await this.settingsService.getOrCreateSettings(organizationId);
    let invoiceNumber: string;

    if (numberingSettings.numberingAllowManual && dto.invoiceNumber) {
      // Use manual invoice number
      invoiceNumber = dto.invoiceNumber.trim();
      
      // Check for duplicates if enabled
      if (numberingSettings.numberingWarnDuplicates) {
        const existing = await this.invoicesRepository.findOne({
          where: { 
            invoiceNumber,
            organization: { id: organizationId },
            isDeleted: false
          }
        });
        if (existing) {
          throw new BadRequestException(
            `Invoice number ${invoiceNumber} already exists. Please use a different number.`
          );
        }
      }
    } else {
      // Auto-generate invoice number
      invoiceNumber = await this.settingsService.generateNextNumber(
        organizationId,
        NumberingSequenceType.INVOICE,
      );
      
      // Check for duplicates if enabled (even for auto-generated numbers)
      if (numberingSettings.numberingWarnDuplicates) {
        let attempts = 0;
        const maxAttempts = 10; // Prevent infinite loop
        while (attempts < maxAttempts) {
          const existing = await this.invoicesRepository.findOne({
            where: { 
              invoiceNumber,
              organization: { id: organizationId },
              isDeleted: false
            }
          });
          if (!existing) {
            break; // Number is unique
          }
          // Regenerate if duplicate found
          invoiceNumber = await this.settingsService.generateNextNumber(
            organizationId,
            NumberingSequenceType.INVOICE,
          );
          attempts++;
        }
        // If still duplicate after max attempts, database unique constraint will catch it
      }
    }

    // Generate public token
    const publicToken = this.generatePublicToken();

    // Get tax settings for default VAT rate
    const taxSettings = await this.settingsService.getTaxSettings(organizationId);
    const defaultTaxRate = taxSettings.taxDefaultRate || 5;
    const taxRates = await this.settingsService.getTaxRates(organizationId);
    const activeStandardRate = taxRates.find(
      (rate) => rate.isActive && rate.type === 'standard',
    );
    const effectiveDefaultRate = activeStandardRate?.rate || defaultTaxRate;

    // Calculate totals from line items
    // Separate standard VAT from reverse charge VAT
    // CRITICAL: invoice.amount should be SUBTOTAL (before VAT), not total including VAT
    // The generated totalAmount column will calculate: amount + vatAmount
    let subtotal = 0; // Amount before VAT
    let standardVatAmount = 0;
    let reverseChargeVatAmount = 0;

    if (dto.lineItems && dto.lineItems.length > 0) {
      for (const item of dto.lineItems) {
        const amount = parseFloat(item.quantity) * parseFloat(item.unitPrice);
        const isReverseCharge = item.vatTaxType === 'REVERSE_CHARGE' || item.vatTaxType === 'reverse_charge';
        
        // Use VAT rate from item, or find matching tax rate, or use default
        let itemVatRate = parseFloat(item.vatRate || '0');
        
        if (itemVatRate === 0) {
          // Try to find matching tax rate by code or type
          if (item.vatTaxType && !isReverseCharge) {
            const matchingRate = taxRates.find(
              (rate) => rate.isActive && rate.type === item.vatTaxType,
            );
            if (matchingRate) {
              itemVatRate = matchingRate.rate;
            } else {
              itemVatRate = effectiveDefaultRate;
            }
          } else if (isReverseCharge) {
            // Use reverse charge rate from settings
            itemVatRate = taxSettings.taxReverseChargeRate || effectiveDefaultRate;
          } else {
            itemVatRate = effectiveDefaultRate;
          }
        }
        
        const vatAmount = amount * (itemVatRate / 100);
        subtotal += amount; // Add base amount to subtotal
        
        if (isReverseCharge) {
          // Reverse charge VAT: calculated but NOT added to total
          reverseChargeVatAmount += vatAmount;
        } else if (item.vatTaxType === 'ZERO_RATED' || item.vatTaxType === 'zero_rated' || 
                   item.vatTaxType === 'EXEMPT' || item.vatTaxType === 'exempt') {
          // Zero rated or exempt: no VAT
          // Do nothing
        } else {
          // Standard VAT: track for vatAmount field, but don't add to subtotal
          standardVatAmount += vatAmount;
        }
      }
    } else {
      // No line items - use provided amount as subtotal
      subtotal = parseFloat(dto.amount || '0');
      // If VAT amount not provided, calculate from default rate
      if (!dto.vatAmount || dto.vatAmount === 0) {
        standardVatAmount = subtotal * (effectiveDefaultRate / 100);
      } else {
        standardVatAmount = parseFloat(dto.vatAmount || '0');
      }
    }

    // Calculate tax on shipping if enabled
    const shippingAmount = parseFloat(dto.shippingAmount || '0');
    let shippingVatAmount = 0;
    if (shippingAmount > 0 && taxSettings.taxCalculateOnShipping) {
      shippingVatAmount = shippingAmount * (effectiveDefaultRate / 100);
      standardVatAmount += shippingVatAmount;
      subtotal += shippingAmount; // Add shipping to subtotal (before VAT)
    } else if (shippingAmount > 0) {
      // Shipping without tax
      subtotal += shippingAmount;
    }

    // Calculate tax on discounts if enabled
    const discountAmount = parseFloat(dto.discountAmount || '0');
    let discountVatAmount = 0;
    if (discountAmount > 0 && taxSettings.taxCalculateOnDiscounts) {
      // Tax on discount: reverse calculation (subtract tax from discount)
      discountVatAmount = discountAmount * (effectiveDefaultRate / 100);
      standardVatAmount -= discountVatAmount; // Subtract tax on discount
      subtotal -= discountAmount; // Subtract discount from subtotal
    } else if (discountAmount > 0) {
      // Discount without tax
      subtotal -= discountAmount;
    }

    // Total VAT amount includes both standard and reverse charge (for reporting)
    const totalVatAmount = standardVatAmount + reverseChargeVatAmount;

    const invoice = this.invoicesRepository.create({
      organization,
      user,
      invoiceNumber,
      invoiceDate: dto.invoiceDate,
      dueDate: dto.dueDate,
      amount: subtotal.toString(), // Subtotal BEFORE VAT
      vatAmount: totalVatAmount.toString(),
      currency: dto.currency || 'AED',
      description: dto.description,
      notes: dto.notes,
      status: dto.status ? (dto.status as InvoiceStatus) : InvoiceStatus.PROFORMA_INVOICE,
      paymentStatus: PaymentStatus.UNPAID,
      paidAmount: '0',
      customer: dto.customerId ? { id: dto.customerId } : undefined,
      customerName: dto.customerName,
      customerTrn: dto.customerTrn,
      publicToken,
    });

    const savedInvoice = await this.invoicesRepository.save(invoice);

    // Override total_amount for invoices with reverse charge (DB generated column adds VAT incorrectly)
    if (reverseChargeVatAmount > 0) {
      // For invoices with reverse charge: total_amount = subtotal + standardVatAmount (excludes reverse charge VAT)
      // The DB generated column would calculate: total_amount = amount + vatAmount
      // But vatAmount includes reverse charge VAT, so we need to override
      const correctTotal = subtotal + standardVatAmount;
      await this.invoicesRepository
        .createQueryBuilder()
        .update(SalesInvoice)
        .set({ totalAmount: correctTotal.toString() })
        .where('id = :id', { id: savedInvoice.id })
        .execute();
    }

    // Create line items
    if (dto.lineItems && dto.lineItems.length > 0) {
      const lineItems = dto.lineItems.map((item: any, index: number) => {
        const amount = parseFloat(item.quantity) * parseFloat(item.unitPrice);
        
        // Determine VAT rate for this line item
        const isReverseCharge = item.vatTaxType === 'REVERSE_CHARGE' || item.vatTaxType === 'reverse_charge';
        let itemVatRate = parseFloat(item.vatRate || '0');
        let taxCode = item.taxCode || null; // Get tax code from item if provided
        
        if (itemVatRate === 0) {
          // Try to find matching tax rate by code or type
          if (item.vatTaxType && !isReverseCharge) {
            const matchingRate = taxRates.find(
              (rate) => rate.isActive && rate.type === item.vatTaxType,
            );
            if (matchingRate) {
              itemVatRate = matchingRate.rate;
              // Use tax code from matching rate if not provided
              if (!taxCode && matchingRate.code) {
                taxCode = matchingRate.code;
              }
            } else {
              itemVatRate = effectiveDefaultRate;
              // Use default tax code from settings if not provided
              if (!taxCode && taxSettings.taxDefaultCode) {
                taxCode = taxSettings.taxDefaultCode;
              }
            }
          } else if (isReverseCharge) {
            // Use reverse charge rate from settings
            itemVatRate = taxSettings.taxReverseChargeRate || effectiveDefaultRate;
            // Use default tax code from settings if not provided
            if (!taxCode && taxSettings.taxDefaultCode) {
              taxCode = taxSettings.taxDefaultCode;
            }
          } else {
            itemVatRate = effectiveDefaultRate;
            // Use default tax code from settings if not provided
            if (!taxCode && taxSettings.taxDefaultCode) {
              taxCode = taxSettings.taxDefaultCode;
            }
          }
        } else {
          // VAT rate provided, but check for default tax code
          if (!taxCode && taxSettings.taxDefaultCode) {
            taxCode = taxSettings.taxDefaultCode;
          }
        }
        
        const vatAmount = amount * (itemVatRate / 100);

        return this.lineItemsRepository.create({
          invoice: savedInvoice,
          organization,
          itemName: item.itemName,
          description: item.description,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toString(),
          unitOfMeasure: item.unitOfMeasure || 'unit',
          vatRate: itemVatRate.toString(),
          vatTaxType: item.vatTaxType || 'standard',
          amount: amount.toString(),
          vatAmount: vatAmount.toString(),
          lineNumber: index + 1,
        });
      });

      await this.lineItemsRepository.save(lineItems);
    }

    return this.findById(organizationId, savedInvoice.id);
  }

  /**
   * Get invoice preview data (for PDF generation and preview)
   */
  async getInvoicePreviewData(
    invoiceId: string,
    organizationId: string,
  ): Promise<any> {
    const invoice = await this.findById(organizationId, invoiceId);
    const outstanding = await this.calculateOutstandingBalance(
      invoiceId,
      organizationId,
    );

    // Get invoice template settings
    const templateSettings = await this.settingsService.getInvoiceTemplate(
      organizationId,
    );

    // Use proxy URL for logo if logo is configured (to serve from private bucket)
    const logoUrl = templateSettings.invoiceLogoUrl
      ? '/api/settings/invoice-template/logo'
      : null;

    return {
      invoice,
      outstandingBalance: outstanding,
      appliedCreditNotes: invoice.creditNoteApplications || [],
      templateSettings: {
        logoUrl,
        headerText: templateSettings.invoiceHeaderText,
        colorScheme: templateSettings.invoiceColorScheme,
        customColor: templateSettings.invoiceCustomColor,
        title: templateSettings.invoiceTitle,
        showCompanyDetails: templateSettings.invoiceShowCompanyDetails,
        showVatDetails: templateSettings.invoiceShowVatDetails,
        showPaymentTerms: templateSettings.invoiceShowPaymentTerms,
        showPaymentMethods: templateSettings.invoiceShowPaymentMethods,
        showBankDetails: templateSettings.invoiceShowBankDetails,
        showTermsAndConditions: templateSettings.invoiceShowTermsConditions,
        defaultPaymentTerms: templateSettings.invoiceDefaultPaymentTerms,
        customPaymentTerms: templateSettings.invoiceCustomPaymentTerms,
        defaultNotes: templateSettings.invoiceDefaultNotes,
        termsAndConditions: templateSettings.invoiceTermsConditions,
        footerText: templateSettings.invoiceFooterText,
        showFooter: templateSettings.invoiceShowFooter,
        showItemDescription: templateSettings.invoiceShowItemDescription,
        showItemQuantity: templateSettings.invoiceShowItemQuantity,
        showItemUnitPrice: templateSettings.invoiceShowItemUnitPrice,
        showItemTotal: templateSettings.invoiceShowItemTotal,
      },
    };
  }

  /**
   * Send reminder email for due/overdue invoices
   */
  async sendReminderEmail(
    invoiceId: string,
    organizationId: string,
    type: 'due' | 'overdue',
  ): Promise<void> {
    const invoice = await this.findById(organizationId, invoiceId);
    const outstanding = await this.calculateOutstandingBalance(
      invoiceId,
      organizationId,
    );

    if (outstanding <= 0) {
      return; // Invoice is paid, no need to send reminder
    }

    const customerEmail = invoice.customer?.email || invoice.customerName;
    if (!customerEmail) {
      return; // No email to send to
    }

    const publicUrl = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/invoices/public/${invoice.publicToken}`;

    if (type === 'overdue') {
      const daysOverdue = invoice.dueDate
        ? Math.floor(
            (new Date().getTime() - new Date(invoice.dueDate).getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : 0;

      await this.emailService.sendEmail({
        to: customerEmail,
        subject: `Invoice ${invoice.invoiceNumber} is Overdue`,
        html: `
          <h2>Invoice Overdue Reminder</h2>
          <p>Dear ${invoice.customerName || 'Customer'},</p>
          <p>This is a reminder that invoice <strong>${invoice.invoiceNumber}</strong> is overdue by ${daysOverdue} days.</p>
          <p><strong>Outstanding Amount:</strong> ${outstanding.toFixed(2)} ${invoice.currency}</p>
          <p><strong>Due Date:</strong> ${invoice.dueDate}</p>
          <p>Please make payment at your earliest convenience.</p>
          <p><a href="${publicUrl}">View Invoice</a></p>
        `,
      });
    } else {
      // Due soon reminder
      await this.emailService.sendEmail({
        to: customerEmail,
        subject: `Invoice ${invoice.invoiceNumber} Due Soon`,
        html: `
          <h2>Invoice Due Date Reminder</h2>
          <p>Dear ${invoice.customerName || 'Customer'},</p>
          <p>This is a reminder that invoice <strong>${invoice.invoiceNumber}</strong> is due on ${invoice.dueDate}.</p>
          <p><strong>Outstanding Amount:</strong> ${outstanding.toFixed(2)} ${invoice.currency}</p>
          <p>Please ensure payment is made by the due date.</p>
          <p><a href="${publicUrl}">View Invoice</a></p>
        `,
      });
    }
  }

  /**
   * Cron job: Check for overdue invoices daily at 9 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async checkOverdueInvoices(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const invoices = await this.invoicesRepository.find({
      where: [
        {
          status: InvoiceStatus.TAX_INVOICE_RECEIVABLE,
          paymentStatus: PaymentStatus.UNPAID,
          isDeleted: false,
        },
        {
          status: InvoiceStatus.SENT, // Legacy status for backward compatibility
          paymentStatus: PaymentStatus.UNPAID,
          isDeleted: false,
        },
      ],
    });

    for (const invoice of invoices) {
      if (invoice.dueDate && invoice.dueDate < today) {
        // Update status to overdue
        invoice.status = InvoiceStatus.OVERDUE;
        await this.invoicesRepository.save(invoice);

        // Send reminder email
        await this.sendReminderEmail(
          invoice.id,
          invoice.organization.id,
          'overdue',
        );
      }
    }
  }

  /**
   * Cron job: Send due date reminders (3 days before due date)
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendDueDateReminders(): Promise<void> {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const dueDate = threeDaysFromNow.toISOString().split('T')[0];

    const invoices = await this.invoicesRepository.find({
      where: [
        {
          dueDate,
          status: InvoiceStatus.TAX_INVOICE_RECEIVABLE,
          paymentStatus: PaymentStatus.UNPAID,
          isDeleted: false,
        },
        {
          dueDate,
          status: InvoiceStatus.SENT, // Legacy status for backward compatibility
          paymentStatus: PaymentStatus.UNPAID,
          isDeleted: false,
        },
      ],
    });

    for (const invoice of invoices) {
      await this.sendReminderEmail(invoice.id, invoice.organization.id, 'due');
    }
  }

  private generatePublicToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Thread-safe invoice number generation using database-level locking
   * Format: INV-YYYY-NNN (e.g., INV-2024-001)
   */
  /**
   * Get next invoice number without creating an invoice
   * Useful for previewing the next number
   */
  async getNextInvoiceNumber(organizationId: string): Promise<string> {
    return this.settingsService.getNextNumber(
      organizationId,
      NumberingSequenceType.INVOICE,
    );
  }

  /**
   * Generate invoice PDF with template settings applied
   */
  async generateInvoicePDF(
    invoiceId: string,
    organizationId: string,
  ): Promise<Buffer> {
    const invoice = await this.invoicesRepository.findOne({
      where: { id: invoiceId, organization: { id: organizationId } },
      relations: ['organization', 'customer', 'lineItems', 'user'],
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Get invoice template settings
    const templateSettings = await this.settingsService.getInvoiceTemplate(
      organizationId,
    );

    // Get currency settings
    const currencySettings = await this.settingsService.getCurrencySettings(
      organizationId,
    );

    // Get tax settings for tax registration info
    const taxSettings = await this.settingsService.getTaxSettings(organizationId);

    // Fetch logo buffer from storage for PDF generation
    const logoBuffer = await this.settingsService.getInvoiceLogoBuffer(organizationId);

    // Get exchange rate if invoice currency differs from base currency
    let exchangeRate = null;
    if (currencySettings.currencyShowExchangeRate && invoice.currency !== invoice.organization?.baseCurrency) {
      // Use the exchange rate from invoice if available
      if (invoice.exchangeRate) {
        exchangeRate = {
          rate: parseFloat(invoice.exchangeRate),
          fromCurrency: invoice.currency,
          toCurrency: invoice.organization?.baseCurrency || 'AED',
          date: invoice.invoiceDate,
        };
      }
    }

    // Determine payment terms
    const paymentTerms =
      templateSettings.invoiceDefaultPaymentTerms === 'Custom'
        ? templateSettings.invoiceCustomPaymentTerms
        : templateSettings.invoiceDefaultPaymentTerms;

    const reportData = {
      type: 'sales_invoice',
      data: invoice,
      metadata: {
        organizationName: invoice.organization?.name,
        vatNumber: invoice.organization?.vatNumber,
        address: invoice.organization?.address,
        currencySettings: {
          displayFormat: currencySettings.currencyDisplayFormat,
          rounding: currencySettings.currencyRounding,
          roundingMethod: currencySettings.currencyRoundingMethod,
          showOnInvoices: currencySettings.currencyShowOnInvoices,
          showExchangeRate: currencySettings.currencyShowExchangeRate,
        },
        taxSettings: {
          taxRegistrationNumber: taxSettings.taxRegistrationNumber,
          taxRegistrationDate: taxSettings.taxRegistrationDate,
          taxShowOnInvoices: taxSettings.taxShowOnInvoices,
          taxShowBreakdown: taxSettings.taxShowBreakdown,
        },
        exchangeRate,
        phone: invoice.organization?.phone,
        email: invoice.organization?.contactEmail,
        website: invoice.organization?.website,
        currency: invoice.currency || 'AED',
        generatedAt: new Date(),
        generatedByName: invoice.user?.name,
        organizationId: invoice.organization?.id,
        // Invoice template settings - use logo buffer for PDF generation
        logoBuffer: logoBuffer,
        logoUrl: null, // Logo is provided as buffer, not URL
        headerText: templateSettings.invoiceHeaderText || invoice.organization?.name,
        colorScheme: templateSettings.invoiceColorScheme || 'blue',
        customColor: templateSettings.invoiceCustomColor,
        invoiceTitle: templateSettings.invoiceTitle || 'TAX INVOICE',
        showCompanyDetails: templateSettings.invoiceShowCompanyDetails ?? true,
        showVatDetails: templateSettings.invoiceShowVatDetails ?? true,
        showPaymentTerms: templateSettings.invoiceShowPaymentTerms ?? true,
        showPaymentMethods: templateSettings.invoiceShowPaymentMethods ?? true,
        showBankDetails: templateSettings.invoiceShowBankDetails ?? false,
        showTermsAndConditions: templateSettings.invoiceShowTermsConditions ?? true,
        paymentTerms: paymentTerms || 'Net 30',
        defaultNotes: templateSettings.invoiceDefaultNotes,
        termsAndConditions: templateSettings.invoiceTermsConditions,
        footerText: templateSettings.invoiceFooterText,
        showFooter: templateSettings.invoiceShowFooter ?? true,
        showItemDescription: templateSettings.invoiceShowItemDescription ?? true,
        showItemQuantity: templateSettings.invoiceShowItemQuantity ?? true,
        showItemUnitPrice: templateSettings.invoiceShowItemUnitPrice ?? true,
        showItemTotal: templateSettings.invoiceShowItemTotal ?? true,
      },
    };

    return this.reportGeneratorService.generatePDF(reportData);
  }

  /**
   * Send invoice via email with PDF attachment
   */
  async sendInvoiceEmail(
    invoiceId: string,
    organizationId: string,
    userId: string,
    emailData: {
      recipientEmail: string;
      subject?: string;
      message?: string;
    },
  ): Promise<void> {
    const invoice = await this.invoicesRepository.findOne({
      where: { id: invoiceId, organization: { id: organizationId } },
      relations: ['organization', 'customer', 'lineItems'],
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (
      !invoice.customerName ||
      (!invoice.customer?.email && !emailData.recipientEmail)
    ) {
      throw new BadRequestException(
        'Customer email is required to send invoice',
      );
    }

    const recipientEmail = emailData.recipientEmail || invoice.customer?.email;

    if (!recipientEmail) {
      throw new BadRequestException('Recipient email is required');
    }

    // Get invoice template settings for email
    const templateSettings = await this.settingsService.getInvoiceTemplate(
      organizationId,
    );

    // Generate PDF
    const pdfBuffer = await this.generateInvoicePDF(invoiceId, organizationId);

    // Build email subject and message using template settings
    const companyName = invoice.organization?.name || 'Company';
    const totalAmount = parseFloat(invoice.totalAmount || '0').toFixed(2);
    const currency = invoice.currency || 'AED';

    // Replace template variables in email subject
    let emailSubject =
      emailData.subject || templateSettings.invoiceEmailSubject || `Invoice ${invoice.invoiceNumber} from ${companyName}`;
    emailSubject = emailSubject
      .replace(/\{\{invoiceNumber\}\}/g, invoice.invoiceNumber)
      .replace(/\{\{companyName\}\}/g, companyName)
      .replace(/\{\{totalAmount\}\}/g, totalAmount)
      .replace(/\{\{currency\}\}/g, currency);

    // Replace template variables in email message
    let emailMessage =
      emailData.message || templateSettings.invoiceEmailMessage || `Please find attached invoice ${invoice.invoiceNumber} for ${totalAmount} ${currency}.`;
    emailMessage = emailMessage
      .replace(/\{\{invoiceNumber\}\}/g, invoice.invoiceNumber)
      .replace(/\{\{companyName\}\}/g, companyName)
      .replace(/\{\{totalAmount\}\}/g, totalAmount)
      .replace(/\{\{currency\}\}/g, currency);

    // Send email with PDF attachment
    await this.emailService.sendEmail({
      to: recipientEmail,
      subject: emailSubject,
      text: emailMessage,
      html: `<p>${emailMessage.replace(/\n/g, '<br>')}</p>`,
      attachments: [
        {
          filename: `invoice-${invoice.invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    // Update invoice status to TAX_INVOICE_RECEIVABLE if it's PROFORMA_INVOICE or DRAFT
    if (invoice.status === InvoiceStatus.PROFORMA_INVOICE || invoice.status === InvoiceStatus.DRAFT) {
      invoice.status = InvoiceStatus.TAX_INVOICE_RECEIVABLE;
      await this.invoicesRepository.save(invoice);
    }
  }

  /**
   * Record payment for an invoice
   */
  async recordPayment(
    organizationId: string,
    invoiceId: string,
    userId: string,
    dto: {
      amount: number;
      paymentDate: string;
      paymentMethod?: PaymentMethod;
      referenceNumber?: string;
      notes?: string;
    },
  ): Promise<InvoicePayment> {
    return await this.dataSource.transaction(async (manager) => {
      const invoice = await manager.findOne(SalesInvoice, {
        where: { id: invoiceId, organization: { id: organizationId } },
      });

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      if (invoice.status === InvoiceStatus.CANCELLED) {
        throw new BadRequestException(
          'Cannot record payment on cancelled invoice',
        );
      }

      const currentPaidAmount = parseFloat(invoice.paidAmount || '0');
      const paymentAmount = parseFloat(dto.amount.toString());
      const totalAmount = parseFloat(invoice.totalAmount);

      // Calculate outstanding balance including credit notes
      const applications = await manager.find(CreditNoteApplication, {
        where: {
          invoice: { id: invoiceId },
          organization: { id: organizationId },
        },
      });

      const appliedCreditAmount = applications.reduce(
        (sum, app) => sum + parseFloat(app.appliedAmount),
        0,
      );

      const outstandingBalance =
        totalAmount - currentPaidAmount - appliedCreditAmount;

      if (paymentAmount > outstandingBalance) {
        throw new BadRequestException(
          `Payment amount (${paymentAmount}) exceeds outstanding balance (${outstandingBalance.toFixed(2)})`,
        );
      }

      if (paymentAmount <= 0) {
        throw new BadRequestException('Payment amount must be greater than 0');
      }

      // Create payment record
      const payment = manager.create(InvoicePayment, {
        invoice: { id: invoiceId },
        organization: { id: organizationId },
        paymentDate: dto.paymentDate,
        amount: paymentAmount.toString(),
        paymentMethod: dto.paymentMethod || PaymentMethod.OTHER,
        referenceNumber: dto.referenceNumber,
        notes: dto.notes,
      });

      await manager.save(payment);

      // Update invoice paidAmount
      invoice.paidAmount = (currentPaidAmount + paymentAmount).toString();

      // Update payment status and invoice status
      const newOutstanding = outstandingBalance - paymentAmount;
      if (newOutstanding <= 0) {
        invoice.paymentStatus = PaymentStatus.PAID;
        invoice.paidDate = dto.paymentDate;
        
        // Check if all payments are cash
        const allPayments = await manager.find(InvoicePayment, {
          where: {
            invoice: { id: invoiceId },
            organization: { id: organizationId },
          },
        });
        
        const allPaymentsCash = allPayments.length > 0 && allPayments.every(
          (p) => p.paymentMethod === PaymentMethod.CASH,
        );
        
        invoice.status = allPaymentsCash
          ? InvoiceStatus.TAX_INVOICE_CASH_RECEIVED
          : InvoiceStatus.TAX_INVOICE_BANK_RECEIVED;
      } else if (currentPaidAmount > 0 || paymentAmount > 0) {
        invoice.paymentStatus = PaymentStatus.PARTIAL;
      } else {
        invoice.paymentStatus = PaymentStatus.UNPAID;
      }

      await manager.save(invoice);

      // Audit log
      await this.auditLogsService.record({
        organizationId,
        userId,
        entityType: 'InvoicePayment',
        entityId: payment.id,
        action: AuditAction.CREATE,
        changes: {
          amount: paymentAmount,
          invoiceId,
          invoiceNumber: invoice.invoiceNumber,
        },
      });

      return payment;
    });
  }

  /**
   * List all payments for an invoice
   */
  async listPayments(
    organizationId: string,
    invoiceId: string,
  ): Promise<InvoicePayment[]> {
    const invoice = await this.invoicesRepository.findOne({
      where: { id: invoiceId, organization: { id: organizationId } },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return this.paymentsRepository.find({
      where: {
        invoice: { id: invoiceId },
        organization: { id: organizationId },
      },
      relations: ['invoice'],
      order: { paymentDate: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * List all invoice payments for an organization
   */
  async listAllPayments(
    organizationId: string,
    filters?: { paymentMethod?: PaymentMethod },
  ): Promise<InvoicePayment[]> {
    const query = this.paymentsRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.invoice', 'invoice')
      .where('payment.organization_id = :organizationId', { organizationId });

    if (filters?.paymentMethod) {
      query.andWhere('payment.payment_method = :paymentMethod', {
        paymentMethod: filters.paymentMethod,
      });
    }

    return query
      .orderBy('payment.payment_date', 'DESC')
      .addOrderBy('payment.created_at', 'DESC')
      .getMany();
  }

  /**
   * Delete a payment and recalculate invoice amounts
   */
  async deletePayment(
    organizationId: string,
    invoiceId: string,
    paymentId: string,
    userId: string,
  ): Promise<void> {
    return await this.dataSource.transaction(async (manager) => {
      const invoice = await manager.findOne(SalesInvoice, {
        where: { id: invoiceId, organization: { id: organizationId } },
      });

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      const payment = await manager.findOne(InvoicePayment, {
        where: {
          id: paymentId,
          invoice: { id: invoiceId },
          organization: { id: organizationId },
        },
      });

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      // Delete payment
      await manager.remove(payment);

      // Recalculate paidAmount from remaining payments
      const remainingPayments = await manager.find(InvoicePayment, {
        where: {
          invoice: { id: invoiceId },
          organization: { id: organizationId },
        },
      });

      const totalPaid = remainingPayments.reduce(
        (sum, p) => sum + parseFloat(p.amount),
        0,
      );

      invoice.paidAmount = totalPaid.toString();

      // Calculate outstanding balance within transaction
      const totalAmount = parseFloat(invoice.totalAmount);
      const currentPaidAmount = parseFloat(invoice.paidAmount || '0');
      
      // Get applied credit notes within transaction
      const applications = await manager.find(CreditNoteApplication, {
        where: {
          invoice: { id: invoiceId },
          organization: { id: organizationId },
        },
      });

      const appliedCreditAmount = applications.reduce(
        (sum, app) => sum + parseFloat(app.appliedAmount),
        0,
      );

      const outstandingBalance = totalAmount - currentPaidAmount - appliedCreditAmount;

      // Update payment status and invoice status
      if (outstandingBalance <= 0) {
        invoice.paymentStatus = PaymentStatus.PAID;
        // Check if all remaining payments are cash
        const allPaymentsCash = remainingPayments.length > 0 && remainingPayments.every(
          (p) => p.paymentMethod === PaymentMethod.CASH,
        );
        invoice.status = allPaymentsCash
          ? InvoiceStatus.TAX_INVOICE_CASH_RECEIVED
          : InvoiceStatus.TAX_INVOICE_BANK_RECEIVED;
        invoice.paidDate =
          remainingPayments.length > 0
            ? remainingPayments[remainingPayments.length - 1].paymentDate
            : null;
      } else if (currentPaidAmount > 0) {
        invoice.paymentStatus = PaymentStatus.PARTIAL;
        // If was fully paid but now has outstanding, revert to receivable
        if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.TAX_INVOICE_BANK_RECEIVED || invoice.status === InvoiceStatus.TAX_INVOICE_CASH_RECEIVED) {
          invoice.status = InvoiceStatus.TAX_INVOICE_RECEIVABLE;
          invoice.paidDate = null;
        }
      } else {
        invoice.paymentStatus = PaymentStatus.UNPAID;
        // If was fully paid but now unpaid, revert to receivable
        if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.TAX_INVOICE_BANK_RECEIVED || invoice.status === InvoiceStatus.TAX_INVOICE_CASH_RECEIVED) {
          invoice.status = InvoiceStatus.TAX_INVOICE_RECEIVABLE;
          invoice.paidDate = null;
        }
      }

      await manager.save(invoice);

      // Audit log
      await this.auditLogsService.record({
        organizationId,
        userId,
        entityType: 'InvoicePayment',
        entityId: paymentId,
        action: AuditAction.DELETE,
        changes: {
          amount: payment.amount,
          invoiceId,
          invoiceNumber: invoice.invoiceNumber,
        },
      });
    });
  }

  /**
   * Update invoice
   */
  async update(
    organizationId: string,
    invoiceId: string,
    userId: string,
    dto: any, // UpdateSalesInvoiceDto
  ): Promise<SalesInvoice> {
    const invoice = await this.findById(organizationId, invoiceId);

    if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.TAX_INVOICE_BANK_RECEIVED || invoice.status === InvoiceStatus.TAX_INVOICE_CASH_RECEIVED) {
      throw new BadRequestException('Cannot update paid invoice');
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot update cancelled invoice');
    }

    // Update allowed fields
    if (dto.status !== undefined) {
      // Validate status transition
      // Note: We already checked above that invoice is not in paid status, so we can safely update
      const newStatus = dto.status as InvoiceStatus;
      const paidStatuses = [
        InvoiceStatus.PAID,
        InvoiceStatus.TAX_INVOICE_BANK_RECEIVED,
        InvoiceStatus.TAX_INVOICE_CASH_RECEIVED,
      ];
      
      // Prevent changing from paid status to non-paid status (redundant check but kept for clarity)
      const currentStatus = invoice.status as InvoiceStatus;
      if (
        paidStatuses.includes(currentStatus) &&
        !paidStatuses.includes(newStatus)
      ) {
        throw new BadRequestException('Cannot change status of paid invoice');
      }
      invoice.status = newStatus;
    }
    if (dto.invoiceDate !== undefined) {
      invoice.invoiceDate = dto.invoiceDate;
    }
    if (dto.dueDate !== undefined) {
      invoice.dueDate = dto.dueDate;
    }
    if (dto.description !== undefined) {
      invoice.description = dto.description;
    }
    if (dto.notes !== undefined) {
      invoice.notes = dto.notes;
    }
    if (dto.customerId !== undefined) {
      if (dto.customerId) {
        const customer = await this.customersRepository.findOne({
          where: { id: dto.customerId, organization: { id: organizationId } },
        });
        if (!customer) {
          throw new NotFoundException('Customer not found');
        }
        invoice.customer = customer;
        invoice.customerName = customer.name;
        invoice.customerTrn = customer.customerTrn;
      } else {
        invoice.customer = null;
        invoice.customerName = dto.customerName;
        invoice.customerTrn = dto.customerTrn;
      }
    }

    // Update line items if provided
    if (dto.lineItems && Array.isArray(dto.lineItems)) {
      // Delete existing line items
      await this.lineItemsRepository.delete({
        invoice: { id: invoiceId },
        organization: { id: organizationId },
      });

      // Get tax settings for reverse charge rate
      const taxSettings = await this.settingsService.getTaxSettings(organizationId);
      const taxRates = await this.settingsService.getTaxRates(organizationId);
      const effectiveDefaultRate = taxSettings.taxDefaultRate || 5;

      // Create new line items
      const lineItems = dto.lineItems.map((item: any, index: number) => {
        const amount = parseFloat(item.quantity) * parseFloat(item.unitPrice);
        const isReverseCharge = item.vatTaxType === 'REVERSE_CHARGE' || item.vatTaxType === 'reverse_charge';
        
        let vatRate = parseFloat(item.vatRate || '0');
        if (vatRate === 0) {
          if (isReverseCharge) {
            vatRate = taxSettings.taxReverseChargeRate || effectiveDefaultRate;
          } else if (item.vatTaxType) {
            const matchingRate = taxRates.find(
              (rate) => rate.isActive && rate.type === item.vatTaxType,
            );
            vatRate = matchingRate?.rate || effectiveDefaultRate;
          } else {
            vatRate = effectiveDefaultRate;
          }
        }
        
        const vatAmount = amount * (vatRate / 100);

        return this.lineItemsRepository.create({
          invoice: { id: invoiceId },
          organization: { id: organizationId },
          itemName: item.itemName,
          description: item.description,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toString(),
          unitOfMeasure: item.unitOfMeasure || 'unit',
          vatRate: vatRate.toString(),
          vatTaxType: item.vatTaxType || 'standard',
          amount: amount.toString(),
          vatAmount: vatAmount.toString(),
          lineNumber: index + 1,
        });
      });

      await this.lineItemsRepository.save(lineItems);

      // Recalculate totals (separate standard VAT from reverse charge)
      // CRITICAL: invoice.amount should be SUBTOTAL (before VAT), not total including VAT
      let subtotal = 0; // Amount before VAT
      let standardVatAmount = 0;
      let reverseChargeVatAmount = 0;

      for (const item of lineItems) {
        const amount = parseFloat(item.amount);
        const vatAmount = parseFloat(item.vatAmount);
        const isReverseCharge = item.vatTaxType === 'reverse_charge' || item.vatTaxType === 'REVERSE_CHARGE';
        
        subtotal += amount; // Add base amount to subtotal
        
        if (isReverseCharge) {
          reverseChargeVatAmount += vatAmount;
          // Reverse charge VAT not added to total
        } else if (item.vatTaxType === 'zero_rated' || item.vatTaxType === 'ZERO_RATED' ||
                   item.vatTaxType === 'exempt' || item.vatTaxType === 'EXEMPT') {
          // Zero rated or exempt: no VAT
        } else {
          standardVatAmount += vatAmount;
          // Standard VAT tracked but not added to subtotal
        }
      }

      // Calculate tax on shipping if enabled (use taxSettings already declared above)
      const shippingAmount = parseFloat(dto.shippingAmount || '0');
      let shippingVatAmount = 0;
      if (shippingAmount > 0 && taxSettings.taxCalculateOnShipping) {
        shippingVatAmount = shippingAmount * (effectiveDefaultRate / 100);
        standardVatAmount += shippingVatAmount;
        subtotal += shippingAmount; // Add shipping to subtotal (before VAT)
      } else if (shippingAmount > 0) {
        // Shipping without tax
        subtotal += shippingAmount;
      }

      // Calculate tax on discounts if enabled (use taxSettings already declared above)
      const discountAmount = parseFloat(dto.discountAmount || '0');
      let discountVatAmount = 0;
      if (discountAmount > 0 && taxSettings.taxCalculateOnDiscounts) {
        // Tax on discount: reverse calculation (subtract tax from discount)
        discountVatAmount = discountAmount * (effectiveDefaultRate / 100);
        standardVatAmount -= discountVatAmount; // Subtract tax on discount
        subtotal -= discountAmount; // Subtract discount from subtotal
      } else if (discountAmount > 0) {
        // Discount without tax
        subtotal -= discountAmount;
      }

      invoice.amount = subtotal.toString(); // Subtotal BEFORE VAT
      invoice.vatAmount = (standardVatAmount + reverseChargeVatAmount).toString(); // Both for reporting
    } else if (dto.amount !== undefined || dto.vatAmount !== undefined) {
      // Update amounts directly
      if (dto.amount !== undefined) {
        invoice.amount = dto.amount.toString();
      }
      if (dto.vatAmount !== undefined) {
        invoice.vatAmount = dto.vatAmount.toString();
      }
    }

    const updated = await this.invoicesRepository.save(invoice);

    // Override total_amount for invoices with reverse charge (DB generated column adds VAT incorrectly)
    // Check if invoice has reverse charge line items
    if (dto.lineItems && Array.isArray(dto.lineItems)) {
      const hasReverseCharge = dto.lineItems.some(
        (item: any) => item.vatTaxType === 'REVERSE_CHARGE' || item.vatTaxType === 'reverse_charge'
      );
      if (hasReverseCharge) {
        // Recalculate to get correct total (excluding reverse charge VAT)
        // Total = subtotal (invoice.amount) + standardVatAmount
        const subtotal = parseFloat(updated.amount);
        // Calculate standard VAT only (excluding reverse charge)
        const lineItems = await this.lineItemsRepository.find({
          where: { invoice: { id: invoice.id } },
        });
        let standardVatOnly = 0;
        for (const item of lineItems) {
          const vatTaxTypeStr = String(item.vatTaxType || '').toLowerCase();
          const isReverseCharge = vatTaxTypeStr === 'reverse_charge' || 
                                  item.vatTaxType === VatTaxType.REVERSE_CHARGE;
          const isZeroRated = vatTaxTypeStr === 'zero_rated' || 
                             item.vatTaxType === VatTaxType.ZERO_RATED;
          const isExempt = vatTaxTypeStr === 'exempt' || 
                          item.vatTaxType === VatTaxType.EXEMPT;
          
          if (!isReverseCharge && !isZeroRated && !isExempt) {
            standardVatOnly += parseFloat(item.vatAmount);
          }
        }
        const correctTotal = subtotal + standardVatOnly;
        await this.invoicesRepository
          .createQueryBuilder()
          .update(SalesInvoice)
          .set({ totalAmount: correctTotal.toString() })
          .where('id = :id', { id: updated.id })
          .execute();
      }
    }

    // Audit log
    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'SalesInvoice',
      entityId: invoiceId,
      action: AuditAction.UPDATE,
      changes: dto,
    });

    return this.findById(organizationId, updated.id);
  }

  /**
   * Update invoice status
   */
  async updateStatus(
    organizationId: string,
    invoiceId: string,
    userId: string,
    status: InvoiceStatus,
  ): Promise<SalesInvoice> {
    const invoice = await this.findById(organizationId, invoiceId);

    // Validate status transition
    if (
      (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.TAX_INVOICE_BANK_RECEIVED || invoice.status === InvoiceStatus.TAX_INVOICE_CASH_RECEIVED) &&
      status !== InvoiceStatus.PAID && status !== InvoiceStatus.TAX_INVOICE_BANK_RECEIVED && status !== InvoiceStatus.TAX_INVOICE_CASH_RECEIVED
    ) {
      throw new BadRequestException('Cannot change status of paid invoice');
    }

    if (
      invoice.status === InvoiceStatus.CANCELLED &&
      status !== InvoiceStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Cannot change status of cancelled invoice',
      );
    }

    if (
      (status === InvoiceStatus.PAID || status === InvoiceStatus.TAX_INVOICE_BANK_RECEIVED || status === InvoiceStatus.TAX_INVOICE_CASH_RECEIVED) &&
      invoice.paymentStatus !== PaymentStatus.PAID
    ) {
      throw new BadRequestException(
        'Cannot set status to paid unless invoice is fully paid',
      );
    }

    invoice.status = status;
    const updated = await this.invoicesRepository.save(invoice);

    // Audit log
    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'SalesInvoice',
      entityId: invoiceId,
      action: AuditAction.UPDATE,
      changes: { status: { from: invoice.status, to: status } },
    });

    return this.findById(organizationId, updated.id);
  }

  /**
   * Delete invoice (soft delete)
   */
  async delete(
    organizationId: string,
    invoiceId: string,
    userId: string,
  ): Promise<void> {
    const invoice = await this.findById(organizationId, invoiceId);

    if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.TAX_INVOICE_BANK_RECEIVED || invoice.status === InvoiceStatus.TAX_INVOICE_CASH_RECEIVED) {
      throw new BadRequestException('Cannot delete paid invoice');
    }

    // Soft delete
    invoice.isDeleted = true;
    await this.invoicesRepository.save(invoice);

    // Audit log
    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'SalesInvoice',
      entityId: invoiceId,
      action: AuditAction.DELETE,
      changes: { invoiceNumber: invoice.invoiceNumber },
    });
  }
}
