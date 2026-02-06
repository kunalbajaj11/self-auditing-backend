import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesOrder } from '../../entities/sales-order.entity';
import { SalesOrderLineItem } from '../../entities/sales-order-line-item.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { Customer } from '../customers/customer.entity';
import { SettingsService } from '../settings/settings.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ReportGeneratorService } from '../reports/report-generator.service';
import { EmailService } from '../notifications/email.service';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { NumberingSequenceType } from '../../entities/numbering-sequence.entity';
import { VatTaxType } from '../../common/enums/vat-tax-type.enum';
import { SalesOrderStatus } from '../../common/enums/sales-order-status.enum';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { UpdateSalesOrderDto } from './dto/update-sales-order.dto';
import { SalesOrderFilterDto } from './dto/sales-order-filter.dto';

@Injectable()
export class SalesOrdersService {
  constructor(
    @InjectRepository(SalesOrder)
    private readonly salesOrdersRepository: Repository<SalesOrder>,
    @InjectRepository(SalesOrderLineItem)
    private readonly lineItemsRepository: Repository<SalesOrderLineItem>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,
    private readonly settingsService: SettingsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly reportGeneratorService: ReportGeneratorService,
    private readonly emailService: EmailService,
  ) {}

  /** Next number for preview only (does not increment). */
  async getNextSONumber(organizationId: string): Promise<string> {
    return this.settingsService.getNextNumber(
      organizationId,
      NumberingSequenceType.SALES_ORDER,
    );
  }

  /** Generate and consume next SO number (use when creating). */
  private async generateNextSONumber(organizationId: string): Promise<string> {
    return this.settingsService.generateNextNumber(
      organizationId,
      NumberingSequenceType.SALES_ORDER,
    );
  }

  async findAll(
    organizationId: string,
    filters: SalesOrderFilterDto,
  ): Promise<SalesOrder[]> {
    const query = this.salesOrdersRepository
      .createQueryBuilder('so')
      .leftJoinAndSelect('so.customer', 'customer')
      .leftJoinAndSelect('so.lineItems', 'lineItems')
      .leftJoinAndSelect('lineItems.product', 'product')
      .leftJoinAndSelect('so.deliveryChallans', 'deliveryChallans')
      .leftJoinAndSelect('so.user', 'user')
      .where('so.organization_id = :organizationId', { organizationId })
      .andWhere('so.is_deleted = false');

    if (filters.status) {
      query.andWhere('so.status = :status', { status: filters.status });
    }

    if (filters.customerId) {
      query.andWhere('so.customer_id = :customerId', {
        customerId: filters.customerId,
      });
    }

    if (filters.customerName) {
      query.andWhere('so.customer_name ILIKE :customerName', {
        customerName: `%${filters.customerName}%`,
      });
    }

    if (filters.startDate) {
      query.andWhere('so.order_date >= :startDate', {
        startDate: filters.startDate,
      });
    }

    if (filters.endDate) {
      query.andWhere('so.order_date <= :endDate', {
        endDate: filters.endDate,
      });
    }

    if (filters.soNumber) {
      query.andWhere('so.so_number ILIKE :soNumber', {
        soNumber: `%${filters.soNumber}%`,
      });
    }

    return query.orderBy('so.order_date', 'DESC').getMany();
  }

  async findById(organizationId: string, soId: string): Promise<SalesOrder> {
    const so = await this.salesOrdersRepository.findOne({
      where: {
        id: soId,
        organization: { id: organizationId },
        isDeleted: false,
      },
      relations: [
        'customer',
        'lineItems',
        'lineItems.product',
        'deliveryChallans',
        'user',
        'organization',
      ],
    });
    if (!so) throw new NotFoundException('Sales order not found');
    return so;
  }

  async create(
    organizationId: string,
    userId: string,
    dto: CreateSalesOrderDto,
  ): Promise<SalesOrder> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) throw new NotFoundException('Organization not found');

    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const soNumber = await this.generateNextSONumber(organizationId);

    let customer: Customer | null = null;
    if (dto.customerId) {
      customer = await this.customersRepository.findOne({
        where: {
          id: dto.customerId,
          organization: { id: organizationId },
          isDeleted: false,
        },
      });
    }

    // Totals from line items
    let totalAmount = 0;
    const lineItems = dto.lineItems.map((item, index) => {
      const quantity = parseFloat(String(item.orderedQuantity || 0));
      const unitPrice = parseFloat(String(item.unitPrice || 0));
      const vatRate = parseFloat(String(item.vatRate ?? 0));
      const amount = quantity * unitPrice;
      let vatAmount = 0;

      const vatTaxType = (item.vatTaxType || 'standard').toLowerCase();
      if (
        vatTaxType !== VatTaxType.ZERO_RATED &&
        vatTaxType !== VatTaxType.EXEMPT
      ) {
        vatAmount = (amount * vatRate) / 100;
      }

      const totalItemAmount = amount + vatAmount;
      totalAmount += totalItemAmount;

      return this.lineItemsRepository.create({
        organization,
        itemName: item.itemName,
        sku: item.sku,
        orderedQuantity: String(quantity),
        unitOfMeasure: item.unitOfMeasure || 'unit',
        unitPrice: String(unitPrice),
        amount: String(amount),
        vatRate: String(vatRate),
        vatAmount: String(vatAmount),
        vatTaxType: (item.vatTaxType as any) || VatTaxType.STANDARD,
        description: item.description,
        lineNumber: index + 1,
        productId: item.productId,
      });
    });

    const salesOrder = this.salesOrdersRepository.create({
      organization,
      user,
      soNumber,
      customer: customer || undefined,
      customerName: dto.customerName || customer?.name || undefined,
      customerTrn: dto.customerTrn || customer?.customerTrn || undefined,
      orderDate: dto.orderDate,
      expectedDeliveryDate: dto.expectedDeliveryDate,
      status: dto.status || SalesOrderStatus.DRAFT,
      totalAmount: String(totalAmount.toFixed(2)),
      currency:
        dto.currency ||
        customer?.preferredCurrency ||
        organization.currency ||
        'AED',
      notes: dto.notes,
      lineItems,
    });

    const saved = await this.salesOrdersRepository.save(salesOrder);

    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'SalesOrder',
      entityId: saved.id,
      action: AuditAction.CREATE,
      changes: { soNumber: saved.soNumber },
    });

    return this.findById(organizationId, saved.id);
  }

  async update(
    organizationId: string,
    soId: string,
    userId: string,
    dto: UpdateSalesOrderDto,
  ): Promise<SalesOrder> {
    const so = await this.findById(organizationId, soId);

    if (
      so.status === SalesOrderStatus.CLOSED &&
      dto.status !== SalesOrderStatus.CLOSED
    ) {
      throw new BadRequestException('Cannot modify closed sales order');
    }
    if (
      so.status === SalesOrderStatus.CANCELLED &&
      dto.status !== SalesOrderStatus.CANCELLED
    ) {
      throw new BadRequestException('Cannot modify cancelled sales order');
    }

    if (dto.customerId !== undefined) {
      const customer = dto.customerId
        ? await this.customersRepository.findOne({
            where: {
              id: dto.customerId,
              organization: { id: organizationId },
              isDeleted: false,
            },
          })
        : null;
      so.customer = customer || undefined;
      if (customer) {
        so.customerName = customer.name;
        so.customerTrn = customer.customerTrn || null;
      }
    }

    if (dto.customerName !== undefined) so.customerName = dto.customerName;
    if (dto.customerTrn !== undefined) so.customerTrn = dto.customerTrn;
    if (dto.orderDate !== undefined) so.orderDate = dto.orderDate;
    if (dto.expectedDeliveryDate !== undefined)
      so.expectedDeliveryDate = dto.expectedDeliveryDate;
    if (dto.status !== undefined) so.status = dto.status;
    if (dto.currency !== undefined) so.currency = dto.currency;
    if (dto.notes !== undefined) so.notes = dto.notes;

    if (dto.lineItems) {
      if (so.status !== SalesOrderStatus.DRAFT) {
        throw new BadRequestException(
          'Line items can only be modified while order is in Draft',
        );
      }

      await this.lineItemsRepository.delete({
        salesOrder: { id: soId } as any,
      });

      let totalAmount = 0;
      const newLineItems = dto.lineItems.map((item, index) => {
        const quantity = parseFloat(String(item.orderedQuantity || 0));
        const unitPrice = parseFloat(String(item.unitPrice || 0));
        const vatRate = parseFloat(String(item.vatRate ?? 0));
        const amount = quantity * unitPrice;
        let vatAmount = 0;

        const vatTaxType = (item.vatTaxType || 'standard').toLowerCase();
        if (
          vatTaxType !== VatTaxType.ZERO_RATED &&
          vatTaxType !== VatTaxType.EXEMPT
        ) {
          vatAmount = (amount * vatRate) / 100;
        }

        const totalItemAmount = amount + vatAmount;
        totalAmount += totalItemAmount;

        return this.lineItemsRepository.create({
          salesOrder: so,
          organization: so.organization,
          itemName: item.itemName,
          sku: item.sku,
          orderedQuantity: String(quantity),
          unitOfMeasure: item.unitOfMeasure || 'unit',
          unitPrice: String(unitPrice),
          amount: String(amount),
          vatRate: String(vatRate),
          vatAmount: String(vatAmount),
          vatTaxType: (item.vatTaxType as any) || VatTaxType.STANDARD,
          description: item.description,
          lineNumber: index + 1,
          productId: item.productId,
        });
      });

      so.lineItems = newLineItems;
      so.totalAmount = String(totalAmount.toFixed(2));
    }

    await this.salesOrdersRepository.save(so);

    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'SalesOrder',
      entityId: soId,
      action: AuditAction.UPDATE,
      changes: { soNumber: so.soNumber },
    });

    return this.findById(organizationId, soId);
  }

  async updateStatus(
    organizationId: string,
    soId: string,
    userId: string,
    status: SalesOrderStatus,
  ): Promise<SalesOrder> {
    const so = await this.findById(organizationId, soId);
    const from = so.status;

    if (so.status === SalesOrderStatus.CLOSED) {
      throw new BadRequestException('Cannot modify closed sales order');
    }
    if (so.status === SalesOrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot modify cancelled sales order');
    }

    so.status = status;
    await this.salesOrdersRepository.save(so);

    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'SalesOrder',
      entityId: soId,
      action: AuditAction.UPDATE,
      changes: { status: { from, to: status } },
    });

    return this.findById(organizationId, soId);
  }

  async sendToCustomer(
    organizationId: string,
    soId: string,
    userId: string,
    email?: string,
  ): Promise<SalesOrder> {
    const so = await this.findById(organizationId, soId);
    if (so.status !== SalesOrderStatus.DRAFT) {
      throw new BadRequestException('Only draft sales orders can be sent');
    }

    so.status = SalesOrderStatus.SENT;
    so.sentDate = new Date();
    if (email) so.sentToEmail = email;
    await this.salesOrdersRepository.save(so);

    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'SalesOrder',
      entityId: soId,
      action: AuditAction.UPDATE,
      changes: {
        status: { from: SalesOrderStatus.DRAFT, to: SalesOrderStatus.SENT },
        sentToEmail: email,
      },
    });

    return this.findById(organizationId, soId);
  }

  async generateSalesOrderPDF(
    soId: string,
    organizationId: string,
  ): Promise<Buffer> {
    const so = await this.findById(organizationId, soId);

    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) throw new NotFoundException('Organization not found');

    const templateSettings =
      await this.settingsService.getInvoiceTemplate(organizationId);
    const logoBuffer =
      await this.settingsService.getInvoiceLogoBuffer(organizationId);
    const currencySettings =
      await this.settingsService.getCurrencySettings(organizationId);

    const reportData = {
      type: 'sales_order',
      data: so,
      metadata: {
        organizationName: organization.name,
        vatNumber: organization.vatNumber,
        address: organization.address,
        phone: organization.phone,
        email: organization.contactEmail,
        website: organization.website,
        currency: so.currency || organization.currency || 'AED',
        generatedAt: new Date(),
        generatedByName: so.user?.name,
        organizationId: organization.id,
        logoBuffer: logoBuffer,
        logoUrl: null,
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

    return this.reportGeneratorService.generatePDF(reportData as any);
  }

  async sendSalesOrderEmail(
    soId: string,
    organizationId: string,
    userId: string,
    emailData: { recipientEmail: string; subject?: string; message?: string },
  ): Promise<void> {
    const so = await this.findById(organizationId, soId);

    const recipientEmail = emailData.recipientEmail || so.customer?.email;
    if (!recipientEmail)
      throw new BadRequestException('Recipient email is required');

    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) throw new NotFoundException('Organization not found');

    const pdfBuffer = await this.generateSalesOrderPDF(soId, organizationId);

    const companyName = organization.name || 'Company';
    const totalAmount = parseFloat(so.totalAmount || '0').toFixed(2);
    const currency = so.currency || 'AED';

    const emailSubject = (
      emailData.subject || `Sales Order ${so.soNumber} from ${companyName}`
    )
      .replace(/\{\{soNumber\}\}/g, so.soNumber)
      .replace(/\{\{companyName\}\}/g, companyName)
      .replace(/\{\{totalAmount\}\}/g, totalAmount)
      .replace(/\{\{currency\}\}/g, currency);

    const emailMessage = (
      emailData.message ||
      `Please find attached Sales Order ${so.soNumber} for ${totalAmount} ${currency}.`
    )
      .replace(/\{\{soNumber\}\}/g, so.soNumber)
      .replace(/\{\{companyName\}\}/g, companyName)
      .replace(/\{\{totalAmount\}\}/g, totalAmount)
      .replace(/\{\{currency\}\}/g, currency);

    await this.emailService.sendEmail({
      to: recipientEmail,
      subject: emailSubject,
      text: emailMessage,
      html: `<p>${emailMessage.replace(/\n/g, '<br>')}</p>`,
      attachments: [
        {
          filename: `sales-order-${so.soNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    so.sentDate = new Date();
    so.sentToEmail = recipientEmail;
    if (so.status === SalesOrderStatus.DRAFT) so.status = SalesOrderStatus.SENT;
    await this.salesOrdersRepository.save(so);

    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'SalesOrder',
      entityId: soId,
      action: AuditAction.UPDATE,
      changes: { action: 'SO sent via email', sentToEmail: recipientEmail },
    });
  }

  async delete(
    organizationId: string,
    soId: string,
    userId: string,
  ): Promise<void> {
    const so = await this.findById(organizationId, soId);
    so.isDeleted = true;
    so.deletedAt = new Date();
    await this.salesOrdersRepository.save(so);

    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'SalesOrder',
      entityId: soId,
      action: AuditAction.DELETE,
      changes: { soNumber: so.soNumber },
    });
  }
}
