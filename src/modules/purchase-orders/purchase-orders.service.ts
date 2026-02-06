import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PurchaseOrder } from '../../entities/purchase-order.entity';
import { PurchaseOrderLineItem } from '../../entities/purchase-order-line-item.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { Vendor } from '../vendors/vendor.entity';
import { Expense } from '../../entities/expense.entity';
import { PurchaseLineItem } from '../../entities/purchase-line-item.entity';
import { PurchaseOrderStatus } from '../../common/enums/purchase-order-status.enum';
import { NumberingSequenceType } from '../../entities/numbering-sequence.entity';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { PurchaseOrderFilterDto } from './dto/purchase-order-filter.dto';
import { ReceiveItemsDto } from './dto/receive-items.dto';
import { ConvertToExpenseDto } from './dto/convert-to-expense.dto';
import { SettingsService } from '../settings/settings.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ExpensesService } from '../expenses/expenses.service';
import { ReportGeneratorService } from '../reports/report-generator.service';
import { EmailService } from '../notifications/email.service';
import { VatTaxType } from '../../common/enums/vat-tax-type.enum';
import { ExpenseType } from '../../common/enums/expense-type.enum';
import { ExpenseSource } from '../../common/enums/expense-source.enum';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrdersRepository: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderLineItem)
    private readonly lineItemsRepository: Repository<PurchaseOrderLineItem>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Vendor)
    private readonly vendorsRepository: Repository<Vendor>,
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
    @InjectRepository(PurchaseLineItem)
    private readonly purchaseLineItemsRepository: Repository<PurchaseLineItem>,
    private readonly settingsService: SettingsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly expensesService: ExpensesService,
    private readonly reportGeneratorService: ReportGeneratorService,
    private readonly emailService: EmailService,
    private readonly dataSource: DataSource,
  ) {}

  /** Next number for preview only (does not increment). */
  async getNextPONumber(organizationId: string): Promise<string> {
    return this.settingsService.getNextNumber(
      organizationId,
      NumberingSequenceType.PURCHASE_ORDER,
    );
  }

  /** Generate and consume next PO number (use when creating). */
  private async generateNextPONumber(organizationId: string): Promise<string> {
    return this.settingsService.generateNextNumber(
      organizationId,
      NumberingSequenceType.PURCHASE_ORDER,
    );
  }

  /**
   * Find all purchase orders with filters
   */
  async findAll(
    organizationId: string,
    filters: PurchaseOrderFilterDto,
  ): Promise<PurchaseOrder[]> {
    const query = this.purchaseOrdersRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.vendor', 'vendor')
      .leftJoinAndSelect('po.lineItems', 'lineItems')
      .leftJoinAndSelect('po.linkedExpenses', 'linkedExpenses')
      .where('po.organization_id = :organizationId', { organizationId })
      .andWhere('po.is_deleted = false');

    if (filters.status) {
      query.andWhere('po.status = :status', { status: filters.status });
    }

    if (filters.vendorId) {
      query.andWhere('po.vendor_id = :vendorId', {
        vendorId: filters.vendorId,
      });
    }

    if (filters.vendorName) {
      query.andWhere('po.vendor_name ILIKE :vendorName', {
        vendorName: `%${filters.vendorName}%`,
      });
    }

    if (filters.startDate) {
      query.andWhere('po.po_date >= :startDate', {
        startDate: filters.startDate,
      });
    }

    if (filters.endDate) {
      query.andWhere('po.po_date <= :endDate', { endDate: filters.endDate });
    }

    if (filters.poNumber) {
      query.andWhere('po.po_number ILIKE :poNumber', {
        poNumber: `%${filters.poNumber}%`,
      });
    }

    return query.orderBy('po.po_date', 'DESC').getMany();
  }

  /**
   * Find purchase order by ID
   */
  async findById(organizationId: string, poId: string): Promise<PurchaseOrder> {
    const po = await this.purchaseOrdersRepository.findOne({
      where: {
        id: poId,
        organization: { id: organizationId },
        isDeleted: false,
      },
      relations: [
        'vendor',
        'lineItems',
        'lineItems.product',
        'linkedExpenses',
        'user',
        'organization',
      ],
    });

    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }

    return po;
  }

  /**
   * Create purchase order
   */
  async create(
    organizationId: string,
    userId: string,
    dto: CreatePurchaseOrderDto,
  ): Promise<PurchaseOrder> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate PO number (increments sequence)
    const poNumber = await this.generateNextPONumber(organizationId);

    // Calculate totals from line items
    let totalAmount = 0;
    const lineItems = dto.lineItems.map((item, index) => {
      const quantity = parseFloat(String(item.orderedQuantity || 0));
      const unitPrice = parseFloat(String(item.unitPrice || 0));
      const vatRate = parseFloat(String(item.vatRate || 0));
      const amount = quantity * unitPrice;
      let vatAmount = 0;

      if (
        item.vatTaxType !== VatTaxType.ZERO_RATED &&
        item.vatTaxType !== VatTaxType.EXEMPT
      ) {
        vatAmount = (amount * vatRate) / 100;
      }

      const totalItemAmount = amount + vatAmount;
      totalAmount += totalItemAmount;

      return this.lineItemsRepository.create({
        itemName: item.itemName,
        sku: item.sku,
        orderedQuantity: String(quantity),
        receivedQuantity: String(item.receivedQuantity || 0),
        unitOfMeasure: item.unitOfMeasure || 'unit',
        unitPrice: String(unitPrice),
        amount: String(amount),
        vatRate: String(vatRate),
        vatAmount: String(vatAmount),
        vatTaxType: (item.vatTaxType as VatTaxType) || VatTaxType.STANDARD,
        description: item.description,
        lineNumber: index + 1,
        productId: item.productId,
      });
    });

    // Resolve vendor
    let vendor: Vendor | null = null;
    if (dto.vendorId) {
      vendor = await this.vendorsRepository.findOne({
        where: { id: dto.vendorId, organization: { id: organizationId } },
      });
    }

    const purchaseOrder = this.purchaseOrdersRepository.create({
      organization,
      user,
      poNumber,
      vendor: vendor || undefined,
      vendorName: dto.vendorName || vendor?.name || undefined,
      vendorTrn: dto.vendorTrn || vendor?.vendorTrn || undefined,
      poDate: dto.poDate,
      expectedDeliveryDate: dto.expectedDeliveryDate,
      status: dto.status || PurchaseOrderStatus.DRAFT,
      totalAmount: String(totalAmount.toFixed(2)),
      currency: dto.currency || organization.currency || 'AED',
      notes: dto.notes,
      lineItems,
    });

    const saved = await this.purchaseOrdersRepository.save(purchaseOrder);

    // Audit log
    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'PurchaseOrder',
      entityId: saved.id,
      action: AuditAction.CREATE,
      changes: { poNumber: saved.poNumber },
    });

    return this.findById(organizationId, saved.id);
  }

  /**
   * Update purchase order
   */
  async update(
    organizationId: string,
    poId: string,
    userId: string,
    dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrder> {
    const po = await this.findById(organizationId, poId);

    // Validate status transitions
    if (
      po.status === PurchaseOrderStatus.CLOSED &&
      dto.status !== PurchaseOrderStatus.CLOSED
    ) {
      throw new BadRequestException('Cannot modify closed purchase order');
    }

    if (
      po.status === PurchaseOrderStatus.CANCELLED &&
      dto.status !== PurchaseOrderStatus.CANCELLED
    ) {
      throw new BadRequestException('Cannot modify cancelled purchase order');
    }

    // Update basic fields
    if (dto.vendorId !== undefined) {
      const vendor = await this.vendorsRepository.findOne({
        where: { id: dto.vendorId, organization: { id: organizationId } },
      });
      po.vendor = vendor || undefined;
    }

    if (dto.vendorName !== undefined) {
      po.vendorName = dto.vendorName;
    }

    if (dto.vendorTrn !== undefined) {
      po.vendorTrn = dto.vendorTrn;
    }

    if (dto.poDate !== undefined) {
      po.poDate = dto.poDate;
    }

    if (dto.expectedDeliveryDate !== undefined) {
      po.expectedDeliveryDate = dto.expectedDeliveryDate;
    }

    if (dto.status !== undefined) {
      po.status = dto.status;
    }

    if (dto.currency !== undefined) {
      po.currency = dto.currency;
    }

    if (dto.notes !== undefined) {
      po.notes = dto.notes;
    }

    // Update line items if provided
    if (dto.lineItems && dto.lineItems.length > 0) {
      // Delete existing line items
      await this.lineItemsRepository.delete({ purchaseOrder: { id: poId } });

      // Calculate new totals
      let totalAmount = 0;
      const newLineItems = dto.lineItems.map((item, index) => {
        const quantity = parseFloat(String(item.orderedQuantity || 0));
        const unitPrice = parseFloat(String(item.unitPrice || 0));
        const vatRate = parseFloat(String(item.vatRate || 0));
        const amount = quantity * unitPrice;
        let vatAmount = 0;

        if (
          item.vatTaxType !== VatTaxType.ZERO_RATED &&
          item.vatTaxType !== VatTaxType.EXEMPT
        ) {
          vatAmount = (amount * vatRate) / 100;
        }

        const totalItemAmount = amount + vatAmount;
        totalAmount += totalItemAmount;

        return this.lineItemsRepository.create({
          purchaseOrder: po,
          itemName: item.itemName,
          sku: item.sku,
          orderedQuantity: String(quantity),
          receivedQuantity: String(item.receivedQuantity || 0),
          unitOfMeasure: item.unitOfMeasure || 'unit',
          unitPrice: String(unitPrice),
          amount: String(amount),
          vatRate: String(vatRate),
          vatAmount: String(vatAmount),
          vatTaxType: (item.vatTaxType as VatTaxType) || VatTaxType.STANDARD,
          description: item.description,
          lineNumber: index + 1,
          productId: item.productId,
        });
      });

      po.lineItems = newLineItems;
      po.totalAmount = String(totalAmount.toFixed(2));
    }

    const updated = await this.purchaseOrdersRepository.save(po);

    // Audit log
    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'PurchaseOrder',
      entityId: poId,
      action: AuditAction.UPDATE,
      changes: { poNumber: po.poNumber },
    });

    return this.findById(organizationId, updated.id);
  }

  /**
   * Delete purchase order (soft delete)
   */
  async delete(
    organizationId: string,
    poId: string,
    userId: string,
  ): Promise<void> {
    const po = await this.findById(organizationId, poId);

    if (po.status === PurchaseOrderStatus.CLOSED) {
      throw new BadRequestException('Cannot delete closed purchase order');
    }

    if (po.linkedExpenses && po.linkedExpenses.length > 0) {
      throw new BadRequestException(
        'Cannot delete purchase order that has linked expenses',
      );
    }

    po.isDeleted = true;
    await this.purchaseOrdersRepository.save(po);

    // Audit log
    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'PurchaseOrder',
      entityId: poId,
      action: AuditAction.DELETE,
      changes: { poNumber: po.poNumber },
    });
  }

  /**
   * Update PO status
   */
  async updateStatus(
    organizationId: string,
    poId: string,
    userId: string,
    status: PurchaseOrderStatus,
  ): Promise<PurchaseOrder> {
    const po = await this.findById(organizationId, poId);

    // Validate status transitions
    if (
      po.status === PurchaseOrderStatus.CLOSED &&
      status !== PurchaseOrderStatus.CLOSED
    ) {
      throw new BadRequestException(
        'Cannot change status of closed purchase order',
      );
    }

    if (
      po.status === PurchaseOrderStatus.CANCELLED &&
      status !== PurchaseOrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Cannot change status of cancelled purchase order',
      );
    }

    po.status = status;

    if (status === PurchaseOrderStatus.SENT) {
      po.sentDate = new Date();
    }

    const updated = await this.purchaseOrdersRepository.save(po);

    // Audit log
    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'PurchaseOrder',
      entityId: poId,
      action: AuditAction.UPDATE,
      changes: {
        status: { from: po.status, to: status },
      },
    });

    return this.findById(organizationId, updated.id);
  }

  /**
   * Mark items as received
   */
  async receiveItems(
    organizationId: string,
    poId: string,
    userId: string,
    dto: ReceiveItemsDto,
  ): Promise<PurchaseOrder> {
    const po = await this.findById(organizationId, poId);

    if (po.status === PurchaseOrderStatus.CLOSED) {
      throw new BadRequestException(
        'Cannot receive items for closed purchase order',
      );
    }

    if (po.status === PurchaseOrderStatus.CANCELLED) {
      throw new BadRequestException(
        'Cannot receive items for cancelled purchase order',
      );
    }

    let allFullyReceived = true;
    let anyPartiallyReceived = false;

    for (const receiveItem of dto.items) {
      const lineItem = po.lineItems.find(
        (li) => li.id === receiveItem.lineItemId,
      );
      if (!lineItem) {
        throw new NotFoundException(
          `Line item ${receiveItem.lineItemId} not found`,
        );
      }

      const orderedQty = parseFloat(lineItem.orderedQuantity);
      const currentReceivedQty = parseFloat(lineItem.receivedQuantity || '0');
      const newReceivedQty = parseFloat(String(receiveItem.receivedQuantity));

      if (newReceivedQty > orderedQty) {
        throw new BadRequestException(
          `Received quantity cannot exceed ordered quantity for item ${lineItem.itemName}`,
        );
      }

      lineItem.receivedQuantity = String(newReceivedQty);

      if (newReceivedQty < orderedQty) {
        allFullyReceived = false;
        if (newReceivedQty > 0) {
          anyPartiallyReceived = true;
        }
      }
    }

    await this.lineItemsRepository.save(po.lineItems);

    // Update PO status based on received quantities
    if (allFullyReceived) {
      po.status = PurchaseOrderStatus.FULLY_RECEIVED;
    } else if (anyPartiallyReceived) {
      po.status = PurchaseOrderStatus.PARTIALLY_RECEIVED;
    }

    const updated = await this.purchaseOrdersRepository.save(po);

    // Audit log
    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'PurchaseOrder',
      entityId: poId,
      action: AuditAction.UPDATE,
      changes: { action: 'Items received' },
    });

    return this.findById(organizationId, updated.id);
  }

  /**
   * Convert Purchase Order to Expense
   */
  async convertToExpense(
    organizationId: string,
    poId: string,
    userId: string,
    dto: ConvertToExpenseDto,
  ): Promise<Expense> {
    const po = await this.findById(organizationId, poId);

    if (po.status === PurchaseOrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot convert cancelled purchase order');
    }

    // Calculate totals from selected line items
    let totalAmount = 0;
    let totalVatAmount = 0;
    const expenseLineItems: any[] = [];

    for (const convertItem of dto.lineItems) {
      const poLineItem = po.lineItems.find(
        (li) => li.id === convertItem.poLineItemId,
      );
      if (!poLineItem) {
        throw new NotFoundException(
          `Line item ${convertItem.poLineItemId} not found`,
        );
      }

      const orderedQty = parseFloat(poLineItem.orderedQuantity);
      const convertQty = convertItem.quantity;

      if (convertQty > orderedQty) {
        throw new BadRequestException(
          `Convert quantity cannot exceed ordered quantity for item ${poLineItem.itemName}`,
        );
      }

      const unitPrice = parseFloat(poLineItem.unitPrice);
      const vatRate = parseFloat(poLineItem.vatRate || '0');
      const lineAmount = convertQty * unitPrice;
      let lineVatAmount = 0;

      if (
        poLineItem.vatTaxType !== VatTaxType.ZERO_RATED &&
        poLineItem.vatTaxType !== VatTaxType.EXEMPT
      ) {
        lineVatAmount = (lineAmount * vatRate) / 100;
      }

      totalAmount += lineAmount;
      totalVatAmount += lineVatAmount;

      expenseLineItems.push({
        productId: poLineItem.productId,
        itemName: poLineItem.itemName,
        sku: poLineItem.sku,
        quantity: convertQty,
        unitOfMeasure: poLineItem.unitOfMeasure || 'unit',
        unitPrice: unitPrice,
        vatRate: vatRate,
        vatTaxType:
          (poLineItem.vatTaxType as VatTaxType) || VatTaxType.STANDARD,
        amount: lineAmount,
        vatAmount: lineVatAmount,
        description: poLineItem.description,
      });
    }

    // Create expense from PO
    const expensePayload: any = {
      type: ExpenseType.EXPENSE,
      vendorId: po.vendor?.id,
      vendorName: po.vendorName || po.vendor?.name,
      vendorTrn: po.vendorTrn || po.vendor?.vendorTrn,
      invoiceNumber: dto.invoiceNumber,
      expenseDate: dto.expenseDate,
      expectedPaymentDate: dto.expectedPaymentDate,
      amount: totalAmount,
      vatAmount: totalVatAmount,
      vatTaxType: VatTaxType.STANDARD,
      description: dto.description || `Expense from PO ${po.poNumber}`,
      lineItems: expenseLineItems,
      purchaseOrderId: po.id,
      source: ExpenseSource.MANUAL,
    };

    const expense = await this.expensesService.create(
      organizationId,
      userId,
      expensePayload,
    );

    // Update PO status to INVOICED if all items converted
    const allItemsConverted = po.lineItems.every((li) => {
      const convertItem = dto.lineItems.find((ci) => ci.poLineItemId === li.id);
      if (!convertItem) return false;
      return (
        parseFloat(String(convertItem.quantity)) >=
        parseFloat(li.orderedQuantity)
      );
    });

    if (allItemsConverted) {
      po.status = PurchaseOrderStatus.INVOICED;
      await this.purchaseOrdersRepository.save(po);
    }

    // Audit log
    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'PurchaseOrder',
      entityId: poId,
      action: AuditAction.UPDATE,
      changes: {
        action: 'Converted to Expense',
        expenseId: expense.id,
      },
    });

    return expense;
  }

  /**
   * Send PO to vendor (update status and sent date)
   */
  async sendToVendor(
    organizationId: string,
    poId: string,
    userId: string,
    email?: string,
  ): Promise<PurchaseOrder> {
    const po = await this.findById(organizationId, poId);

    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Only draft purchase orders can be sent');
    }

    po.status = PurchaseOrderStatus.SENT;
    po.sentDate = new Date();
    if (email) {
      po.sentToEmail = email;
    }

    const updated = await this.purchaseOrdersRepository.save(po);

    // Audit log
    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'PurchaseOrder',
      entityId: poId,
      action: AuditAction.UPDATE,
      changes: {
        status: {
          from: PurchaseOrderStatus.DRAFT,
          to: PurchaseOrderStatus.SENT,
        },
        sentToEmail: email,
      },
    });

    return this.findById(organizationId, updated.id);
  }

  /**
   * Generate Purchase Order PDF
   */
  async generatePOPDF(poId: string, organizationId: string): Promise<Buffer> {
    const po = await this.findById(organizationId, poId);

    // Get organization settings
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Get invoice template settings (reuse for PO)
    const templateSettings =
      await this.settingsService.getInvoiceTemplate(organizationId);

    // Fetch logo buffer
    const logoBuffer =
      await this.settingsService.getInvoiceLogoBuffer(organizationId);

    // Get currency settings
    const currencySettings =
      await this.settingsService.getCurrencySettings(organizationId);

    const reportData = {
      type: 'purchase_order',
      data: po,
      metadata: {
        organizationName: organization.name,
        vatNumber: organization.vatNumber,
        address: organization.address,
        phone: organization.phone,
        email: organization.contactEmail,
        website: organization.website,
        currency: po.currency || organization.currency || 'AED',
        generatedAt: new Date(),
        generatedByName: po.user?.name,
        organizationId: organization.id,
        logoBuffer: logoBuffer,
        logoUrl: null, // Logo is provided as buffer, not URL
        // Reuse invoice template settings schema so PDF generator can honor styling + flags
        invoiceTemplate: {
          logoBuffer: logoBuffer,
          logoUrl: null,
          headerText:
            templateSettings.invoiceHeaderText ||
            organization.name ||
            'Company',
          colorScheme: templateSettings.invoiceColorScheme || 'blue',
          customColor: templateSettings.invoiceCustomColor,
          footerText: templateSettings.invoiceFooterText,
          showFooter: templateSettings.invoiceShowFooter ?? true,
          showCompanyDetails:
            templateSettings.invoiceShowCompanyDetails ?? true,
          showBankDetails: templateSettings.invoiceShowBankDetails ?? false,
        },
        currencySettings: {
          displayFormat: currencySettings.currencyDisplayFormat,
          rounding: currencySettings.currencyRounding,
          roundingMethod: currencySettings.currencyRoundingMethod,
        },
      },
    };

    return this.reportGeneratorService.generatePDF(reportData);
  }

  /**
   * Send Purchase Order to vendor via email
   */
  async sendPOEmail(
    poId: string,
    organizationId: string,
    userId: string,
    emailData: {
      recipientEmail: string;
      subject?: string;
      message?: string;
    },
  ): Promise<void> {
    const po = await this.findById(organizationId, poId);

    if (!po.vendorName && !po.vendor) {
      throw new BadRequestException(
        'Vendor information is required to send purchase order',
      );
    }

    const recipientEmail = emailData.recipientEmail || po.vendor?.email;

    if (!recipientEmail) {
      throw new BadRequestException('Recipient email is required');
    }

    // Get organization
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Generate PDF
    const pdfBuffer = await this.generatePOPDF(poId, organizationId);

    // Build email subject and message
    const companyName = organization.name || 'Company';
    const totalAmount = parseFloat(po.totalAmount || '0').toFixed(2);
    const currency = po.currency || 'AED';

    let emailSubject =
      emailData.subject || `Purchase Order ${po.poNumber} from ${companyName}`;
    emailSubject = emailSubject
      .replace(/\{\{poNumber\}\}/g, po.poNumber)
      .replace(/\{\{companyName\}\}/g, companyName)
      .replace(/\{\{totalAmount\}\}/g, totalAmount)
      .replace(/\{\{currency\}\}/g, currency);

    let emailMessage =
      emailData.message ||
      `Please find attached Purchase Order ${po.poNumber} for ${totalAmount} ${currency}.`;
    emailMessage = emailMessage
      .replace(/\{\{poNumber\}\}/g, po.poNumber)
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
          filename: `purchase-order-${po.poNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    // Update PO sent date and email
    po.sentDate = new Date();
    po.sentToEmail = recipientEmail;
    if (po.status === PurchaseOrderStatus.DRAFT) {
      po.status = PurchaseOrderStatus.SENT;
    }
    await this.purchaseOrdersRepository.save(po);

    // Audit log
    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'PurchaseOrder',
      entityId: poId,
      action: AuditAction.UPDATE,
      changes: {
        action: 'PO sent via email',
        sentToEmail: recipientEmail,
      },
    });
  }
}
