import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { InvoiceLineItem } from '../../entities/invoice-line-item.entity';
import { InvoicePayment } from '../../entities/invoice-payment.entity';
import { CreditNoteApplication } from '../../entities/credit-note-application.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { PaymentStatus } from '../../common/enums/payment-status.enum';
import { EmailService } from '../notifications/email.service';
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
    private readonly emailService: EmailService,
  ) {}

  async findAll(organizationId: string, filters: any): Promise<SalesInvoice[]> {
    const query = this.invoicesRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.customer', 'customer')
      .leftJoinAndSelect('invoice.lineItems', 'lineItems')
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
      invoice.status = InvoiceStatus.PAID;
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

    // Generate invoice number
    const year = new Date().getFullYear();
    const invoiceNumber = await this.generateInvoiceNumber(
      organizationId,
      year,
    );

    // Generate public token
    const publicToken = this.generatePublicToken();

    // Calculate totals from line items
    let totalAmount = 0;
    let totalVatAmount = 0;

    if (dto.lineItems && dto.lineItems.length > 0) {
      for (const item of dto.lineItems) {
        const amount = parseFloat(item.quantity) * parseFloat(item.unitPrice);
        const vatAmount = amount * (parseFloat(item.vatRate || '5') / 100);
        totalAmount += amount;
        totalVatAmount += vatAmount;
      }
    } else {
      totalAmount = parseFloat(dto.amount || '0');
      totalVatAmount = parseFloat(dto.vatAmount || '0');
    }

    const invoice = this.invoicesRepository.create({
      organization,
      user,
      invoiceNumber,
      invoiceDate: dto.invoiceDate,
      dueDate: dto.dueDate,
      amount: totalAmount.toString(),
      vatAmount: totalVatAmount.toString(),
      currency: dto.currency || 'AED',
      description: dto.description,
      notes: dto.notes,
      status: InvoiceStatus.DRAFT,
      paymentStatus: PaymentStatus.UNPAID,
      paidAmount: '0',
      customer: dto.customerId ? { id: dto.customerId } : undefined,
      customerName: dto.customerName,
      customerTrn: dto.customerTrn,
      publicToken,
    });

    const savedInvoice = await this.invoicesRepository.save(invoice);

    // Create line items
    if (dto.lineItems && dto.lineItems.length > 0) {
      const lineItems = dto.lineItems.map((item: any, index: number) => {
        const amount = parseFloat(item.quantity) * parseFloat(item.unitPrice);
        const vatRate = parseFloat(item.vatRate || '5');
        const vatAmount = amount * (vatRate / 100);

        return this.lineItemsRepository.create({
          invoice: savedInvoice,
          organization,
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
    }

    return this.findById(organizationId, savedInvoice.id);
  }

  /**
   * Get invoice preview data (for PDF generation)
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

    return {
      invoice,
      outstandingBalance: outstanding,
      appliedCreditNotes: invoice.creditNoteApplications || [],
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
      where: {
        status: InvoiceStatus.SENT,
        paymentStatus: PaymentStatus.UNPAID,
        isDeleted: false,
      },
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
      where: {
        dueDate,
        status: InvoiceStatus.SENT,
        paymentStatus: PaymentStatus.UNPAID,
        isDeleted: false,
      },
    });

    for (const invoice of invoices) {
      await this.sendReminderEmail(invoice.id, invoice.organization.id, 'due');
    }
  }

  private generatePublicToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private async generateInvoiceNumber(
    organizationId: string,
    year: number,
  ): Promise<string> {
    // Implementation for generating invoice numbers
    return `INV-${year}-${Date.now()}`;
  }
}
