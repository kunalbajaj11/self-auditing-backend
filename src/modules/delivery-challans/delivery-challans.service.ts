import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeliveryChallan } from '../../entities/delivery-challan.entity';
import { DeliveryChallanLineItem } from '../../entities/delivery-challan-line-item.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { Customer } from '../customers/customer.entity';
import { SalesOrder } from '../../entities/sales-order.entity';
import { SalesOrderLineItem } from '../../entities/sales-order-line-item.entity';
import { DeliveryChallanStatus } from '../../common/enums/delivery-challan-status.enum';
import { CreateDeliveryChallanDto } from './dto/create-delivery-challan.dto';
import { UpdateDeliveryChallanDto } from './dto/update-delivery-challan.dto';
import { DeliveryChallanFilterDto } from './dto/delivery-challan-filter.dto';
import { SettingsService } from '../settings/settings.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ReportGeneratorService } from '../reports/report-generator.service';
import { EmailService } from '../notifications/email.service';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { NumberingSequenceType } from '../../entities/numbering-sequence.entity';
import { InventoryService } from '../inventory/inventory.service';
import { Product } from '../products/product.entity';
import { StockMovementType } from '../../common/enums/stock-movement-type.enum';
import { PlanType } from '../../common/enums/plan-type.enum';
import { StockMovement } from '../inventory/entities/stock-movement.entity';

@Injectable()
export class DeliveryChallansService {
  constructor(
    @InjectRepository(DeliveryChallan)
    private readonly deliveryChallansRepository: Repository<DeliveryChallan>,
    @InjectRepository(DeliveryChallanLineItem)
    private readonly lineItemsRepository: Repository<DeliveryChallanLineItem>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,
    @InjectRepository(SalesOrder)
    private readonly salesOrdersRepository: Repository<SalesOrder>,
    @InjectRepository(SalesOrderLineItem)
    private readonly salesOrderLineItemsRepository: Repository<SalesOrderLineItem>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(StockMovement)
    private readonly stockMovementsRepository: Repository<StockMovement>,
    private readonly settingsService: SettingsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly reportGeneratorService: ReportGeneratorService,
    private readonly emailService: EmailService,
    private readonly inventoryService: InventoryService,
  ) {}

  /** Next number for preview only (does not increment). */
  async getNextChallanNumber(organizationId: string): Promise<string> {
    return this.settingsService.getNextNumber(
      organizationId,
      NumberingSequenceType.DELIVERY_CHALLAN,
    );
  }

  /** Generate and consume next DC number (use when creating). */
  private async generateNextChallanNumber(
    organizationId: string,
  ): Promise<string> {
    return this.settingsService.generateNextNumber(
      organizationId,
      NumberingSequenceType.DELIVERY_CHALLAN,
    );
  }

  async findAll(
    organizationId: string,
    filters: DeliveryChallanFilterDto,
  ): Promise<DeliveryChallan[]> {
    const query = this.deliveryChallansRepository
      .createQueryBuilder('dc')
      .leftJoinAndSelect('dc.customer', 'customer')
      .leftJoinAndSelect('dc.salesOrder', 'salesOrder')
      .leftJoinAndSelect('dc.lineItems', 'lineItems')
      .leftJoinAndSelect('lineItems.product', 'product')
      .leftJoinAndSelect('dc.user', 'user')
      .where('dc.organization_id = :organizationId', { organizationId })
      .andWhere('dc.is_deleted = false');

    if (filters.status) {
      query.andWhere('dc.status = :status', { status: filters.status });
    }
    if (filters.customerId) {
      query.andWhere('dc.customer_id = :customerId', {
        customerId: filters.customerId,
      });
    }
    if (filters.salesOrderId) {
      query.andWhere('dc.sales_order_id = :salesOrderId', {
        salesOrderId: filters.salesOrderId,
      });
    }
    if (filters.customerName) {
      query.andWhere('dc.customer_name ILIKE :customerName', {
        customerName: `%${filters.customerName}%`,
      });
    }
    if (filters.startDate) {
      query.andWhere('dc.challan_date >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters.endDate) {
      query.andWhere('dc.challan_date <= :endDate', {
        endDate: filters.endDate,
      });
    }
    if (filters.challanNumber) {
      query.andWhere('dc.challan_number ILIKE :challanNumber', {
        challanNumber: `%${filters.challanNumber}%`,
      });
    }

    return query.orderBy('dc.challan_date', 'DESC').getMany();
  }

  async findById(
    organizationId: string,
    dcId: string,
  ): Promise<DeliveryChallan> {
    const dc = await this.deliveryChallansRepository.findOne({
      where: {
        id: dcId,
        organization: { id: organizationId },
        isDeleted: false,
      },
      relations: [
        'customer',
        'salesOrder',
        'salesOrder.customer',
        'lineItems',
        'lineItems.product',
        'user',
        'organization',
      ],
    });
    if (!dc) throw new NotFoundException('Delivery challan not found');
    return dc;
  }

  async create(
    organizationId: string,
    userId: string,
    dto: CreateDeliveryChallanDto,
  ): Promise<DeliveryChallan> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) throw new NotFoundException('Organization not found');

    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const challanNumber = await this.generateNextChallanNumber(organizationId);

    let salesOrder: SalesOrder | null = null;
    if (dto.salesOrderId) {
      salesOrder = await this.salesOrdersRepository.findOne({
        where: {
          id: dto.salesOrderId,
          organization: { id: organizationId },
          isDeleted: false,
        },
        relations: ['customer', 'lineItems', 'lineItems.product'],
      });
      if (!salesOrder) throw new NotFoundException('Sales order not found');
    }

    let customer: Customer | null = null;
    const customerId = dto.customerId || salesOrder?.customer?.id;
    if (customerId) {
      customer = await this.customersRepository.findOne({
        where: {
          id: customerId,
          organization: { id: organizationId },
          isDeleted: false,
        },
      });
    }

    const lineItemsInput = dto.lineItems?.length
      ? dto.lineItems
      : salesOrder?.lineItems?.map((li) => ({
          productId: li.productId || li.product?.id,
          itemName: li.itemName,
          description: li.description || undefined,
          quantity: parseFloat(li.orderedQuantity || '0'),
          unitOfMeasure: li.unitOfMeasure || 'unit',
        })) || [];

    if (!lineItemsInput.length) {
      throw new BadRequestException('At least one line item is required');
    }

    const lineItems = lineItemsInput.map((item, index) =>
      this.lineItemsRepository.create({
        organization,
        itemName: item.itemName,
        description: item.description,
        quantity: String(item.quantity),
        unitOfMeasure: item.unitOfMeasure || 'unit',
        lineNumber: index + 1,
        productId: item.productId,
      }),
    );

    const dc = this.deliveryChallansRepository.create({
      organization,
      user,
      challanNumber,
      challanDate: dto.challanDate,
      customer: customer || undefined,
      customerName:
        dto.customerName ||
        customer?.name ||
        salesOrder?.customerName ||
        undefined,
      customerTrn:
        dto.customerTrn ||
        customer?.customerTrn ||
        salesOrder?.customerTrn ||
        undefined,
      salesOrder: salesOrder || undefined,
      salesOrderId: salesOrder?.id,
      status: dto.status || DeliveryChallanStatus.DRAFT,
      deliveryAddress: dto.deliveryAddress,
      vehicleNumber: dto.vehicleNumber,
      transportMode: dto.transportMode,
      lrNumber: dto.lrNumber,
      notes: dto.notes,
      lineItems,
    });

    const saved = await this.deliveryChallansRepository.save(dc);

    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'DeliveryChallan',
      entityId: saved.id,
      action: AuditAction.CREATE,
      changes: { challanNumber: saved.challanNumber },
    });

    // If created directly as dispatched/delivered, run stock movement
    if (
      saved.status === DeliveryChallanStatus.DISPATCHED ||
      saved.status === DeliveryChallanStatus.DELIVERED
    ) {
      await this.ensureStockMovementsForDispatch(
        organizationId,
        userId,
        saved.id,
      );
    }

    return this.findById(organizationId, saved.id);
  }

  async createFromSalesOrder(
    organizationId: string,
    userId: string,
    salesOrderId: string,
    dto: {
      challanDate: string;
      notes?: string;
      deliveryAddress?: string;
      vehicleNumber?: string;
      transportMode?: string;
      lrNumber?: string;
      lineItems?: Array<{ salesOrderLineItemId?: string; quantity: number }>;
    },
  ): Promise<DeliveryChallan> {
    const so = await this.salesOrdersRepository.findOne({
      where: {
        id: salesOrderId,
        organization: { id: organizationId },
        isDeleted: false,
      },
      relations: [
        'customer',
        'lineItems',
        'lineItems.product',
        'organization',
        'user',
      ],
    });
    if (!so) throw new NotFoundException('Sales order not found');

    const soLineItems = await this.salesOrderLineItemsRepository.find({
      where: {
        organization: { id: organizationId } as any,
        salesOrder: { id: salesOrderId } as any,
        isDeleted: false,
      },
      relations: ['product', 'organization', 'salesOrder'],
      order: { lineNumber: 'ASC' },
    });

    let selected: Array<{ salesOrderLineItemId?: string; quantity: number }>;
    if (dto.lineItems?.length) {
      selected = dto.lineItems;
    } else if (so.lineItems?.length) {
      selected = so.lineItems.map((li) => ({
        salesOrderLineItemId: li.id,
        quantity: parseFloat(li.orderedQuantity || '0'),
      }));
    } else if (soLineItems.length > 0) {
      selected = soLineItems.map((li) => ({
        salesOrderLineItemId: li.id,
        quantity: parseFloat(li.orderedQuantity || '0'),
      }));
    } else {
      throw new BadRequestException(
        'Sales order has no line items. Add items to the sales order first.',
      );
    }

    const inputLineItems = selected.map((sel) => {
      const li = sel.salesOrderLineItemId
        ? soLineItems.find((x) => x.id === sel.salesOrderLineItemId)
        : undefined;
      if (!li) {
        throw new BadRequestException(
          'Invalid sales order line item selection',
        );
      }
      return {
        productId: li.productId || li.product?.id,
        itemName: li.itemName,
        description: li.description || undefined,
        quantity: sel.quantity,
        unitOfMeasure: li.unitOfMeasure || 'unit',
      };
    });

    return this.create(organizationId, userId, {
      salesOrderId,
      customerId: so.customer?.id,
      customerName: so.customerName || so.customer?.name,
      customerTrn: so.customerTrn || so.customer?.customerTrn,
      challanDate: dto.challanDate,
      notes: dto.notes,
      deliveryAddress: dto.deliveryAddress,
      vehicleNumber: dto.vehicleNumber,
      transportMode: dto.transportMode,
      lrNumber: dto.lrNumber,
      lineItems: inputLineItems,
    } as any);
  }

  async update(
    organizationId: string,
    dcId: string,
    userId: string,
    dto: UpdateDeliveryChallanDto,
  ): Promise<DeliveryChallan> {
    const dc = await this.findById(organizationId, dcId);

    if (
      dc.status === DeliveryChallanStatus.DISPATCHED ||
      dc.status === DeliveryChallanStatus.DELIVERED
    ) {
      // allow only notes/transport meta changes after dispatch; no line item edits
      if (dto.lineItems) {
        throw new BadRequestException(
          'Line items cannot be modified after challan is dispatched',
        );
      }
    }

    if (dto.salesOrderId !== undefined) {
      const so = dto.salesOrderId
        ? await this.salesOrdersRepository.findOne({
            where: {
              id: dto.salesOrderId,
              organization: { id: organizationId },
              isDeleted: false,
            },
            relations: ['customer'],
          })
        : null;
      dc.salesOrder = so || undefined;
      dc.salesOrderId = so?.id || null;
      if (so?.customer) {
        dc.customer = so.customer;
        dc.customerName = so.customer.name;
        dc.customerTrn = so.customer.customerTrn || null;
      }
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
      dc.customer = customer || undefined;
      if (customer) {
        dc.customerName = customer.name;
        dc.customerTrn = customer.customerTrn || null;
      }
    }

    if (dto.customerName !== undefined) dc.customerName = dto.customerName;
    if (dto.customerTrn !== undefined) dc.customerTrn = dto.customerTrn;
    if (dto.challanDate !== undefined) dc.challanDate = dto.challanDate;
    if (dto.status !== undefined) dc.status = dto.status;
    if (dto.deliveryAddress !== undefined)
      dc.deliveryAddress = dto.deliveryAddress;
    if (dto.vehicleNumber !== undefined) dc.vehicleNumber = dto.vehicleNumber;
    if (dto.transportMode !== undefined) dc.transportMode = dto.transportMode;
    if (dto.lrNumber !== undefined) dc.lrNumber = dto.lrNumber;
    if (dto.notes !== undefined) dc.notes = dto.notes;

    if (dto.lineItems) {
      await this.lineItemsRepository.delete({
        deliveryChallan: { id: dcId } as any,
      });
      const organization = await this.organizationsRepository.findOne({
        where: { id: organizationId },
      });
      if (!organization) throw new NotFoundException('Organization not found');

      const newLineItems = dto.lineItems.map((item, index) =>
        this.lineItemsRepository.create({
          deliveryChallan: dc,
          organization,
          itemName: item.itemName,
          description: item.description,
          quantity: String(item.quantity),
          unitOfMeasure: item.unitOfMeasure || 'unit',
          lineNumber: index + 1,
          productId: item.productId,
        }),
      );
      dc.lineItems = newLineItems;
    }

    await this.deliveryChallansRepository.save(dc);

    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'DeliveryChallan',
      entityId: dcId,
      action: AuditAction.UPDATE,
      changes: { challanNumber: dc.challanNumber },
    });

    // If status updated via update (rare), ensure stock
    if (
      dc.status === DeliveryChallanStatus.DISPATCHED ||
      dc.status === DeliveryChallanStatus.DELIVERED
    ) {
      await this.ensureStockMovementsForDispatch(organizationId, userId, dcId);
    }

    return this.findById(organizationId, dcId);
  }

  async updateStatus(
    organizationId: string,
    dcId: string,
    userId: string,
    status: DeliveryChallanStatus,
  ): Promise<DeliveryChallan> {
    const dc = await this.findById(organizationId, dcId);
    const from = dc.status;

    if (dc.status === DeliveryChallanStatus.CANCELLED) {
      throw new BadRequestException('Cannot modify cancelled delivery challan');
    }

    dc.status = status;
    if (status === DeliveryChallanStatus.DISPATCHED && !dc.dispatchedAt) {
      dc.dispatchedAt = new Date();
    }
    if (status === DeliveryChallanStatus.DELIVERED && !dc.deliveredAt) {
      dc.deliveredAt = new Date();
      if (!dc.dispatchedAt) dc.dispatchedAt = dc.deliveredAt;
    }

    await this.deliveryChallansRepository.save(dc);

    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'DeliveryChallan',
      entityId: dcId,
      action: AuditAction.UPDATE,
      changes: { status: { from, to: status } },
    });

    if (
      status === DeliveryChallanStatus.DISPATCHED ||
      status === DeliveryChallanStatus.DELIVERED
    ) {
      await this.ensureStockMovementsForDispatch(organizationId, userId, dcId);
    }

    return this.findById(organizationId, dcId);
  }

  private async ensureStockMovementsForDispatch(
    organizationId: string,
    userId: string,
    dcId: string,
  ): Promise<void> {
    const org = await this.organizationsRepository.findOne({
      where: { id: organizationId },
      select: ['id', 'planType'],
    });

    const hasInventoryAccess =
      org?.planType === PlanType.PREMIUM ||
      org?.planType === PlanType.ENTERPRISE;
    if (!hasInventoryAccess) return;

    const alreadyRecorded = await this.stockMovementsRepository.count({
      where: {
        organization: { id: organizationId } as any,
        referenceType: 'delivery_challan',
        referenceId: dcId,
        isDeleted: false,
      },
    });
    if (alreadyRecorded > 0) return;

    const dc = await this.findById(organizationId, dcId);
    const locations =
      await this.inventoryService.findAllLocations(organizationId);
    if (locations.length === 0) {
      throw new BadRequestException(
        'No inventory locations configured. Please create an inventory location before dispatching.',
      );
    }
    const location = locations.find((l) => l.isDefault) || locations[0];

    for (const lineItem of dc.lineItems || []) {
      const productId = (lineItem as any).productId || lineItem.product?.id;
      if (!productId) continue; // allow non-inventory lines

      const product = await this.productsRepository.findOne({
        where: {
          id: productId,
          organization: { id: organizationId },
          isDeleted: false,
        },
      });
      if (!product) continue;

      const unitCost = product.costPrice
        ? parseFloat(product.costPrice)
        : product.averageCost
          ? parseFloat(product.averageCost)
          : 0;

      const qty = parseFloat(lineItem.quantity || '0');
      if (!qty) continue;

      await this.inventoryService.recordStockMovement(organizationId, userId, {
        productId,
        locationId: location.id,
        movementType: StockMovementType.SALE,
        quantity: -Math.abs(qty),
        unitCost,
        referenceType: 'delivery_challan',
        referenceId: dc.id,
        notes: `Delivery via challan ${dc.challanNumber}`,
      });
    }
  }

  async generateDeliveryChallanPDF(
    dcId: string,
    organizationId: string,
  ): Promise<Buffer> {
    const dc = await this.findById(organizationId, dcId);

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
      type: 'delivery_challan',
      data: dc,
      metadata: {
        organizationName: organization.name,
        vatNumber: organization.vatNumber,
        address: organization.address,
        phone: organization.phone,
        email: organization.contactEmail,
        website: organization.website,
        currency: organization.currency || 'AED',
        generatedAt: new Date(),
        generatedByName: dc.user?.name,
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
          showBankDetails: false,
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

  async sendDeliveryChallanEmail(
    dcId: string,
    organizationId: string,
    userId: string,
    emailData: { recipientEmail: string; subject?: string; message?: string },
  ): Promise<void> {
    const dc = await this.findById(organizationId, dcId);

    const recipientEmail = emailData.recipientEmail || dc.customer?.email;
    if (!recipientEmail)
      throw new BadRequestException('Recipient email is required');

    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) throw new NotFoundException('Organization not found');

    const pdfBuffer = await this.generateDeliveryChallanPDF(
      dcId,
      organizationId,
    );

    const companyName = organization.name || 'Company';
    const emailSubject = (
      emailData.subject ||
      `Delivery Challan ${dc.challanNumber} from ${companyName}`
    )
      .replace(/\{\{challanNumber\}\}/g, dc.challanNumber)
      .replace(/\{\{companyName\}\}/g, companyName);

    const emailMessage = (
      emailData.message ||
      `Please find attached Delivery Challan ${dc.challanNumber}.`
    )
      .replace(/\{\{challanNumber\}\}/g, dc.challanNumber)
      .replace(/\{\{companyName\}\}/g, companyName);

    await this.emailService.sendEmail({
      to: recipientEmail,
      subject: emailSubject,
      text: emailMessage,
      html: `<p>${emailMessage.replace(/\n/g, '<br>')}</p>`,
      attachments: [
        {
          filename: `delivery-challan-${dc.challanNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'DeliveryChallan',
      entityId: dcId,
      action: AuditAction.UPDATE,
      changes: { action: 'DC sent via email', sentToEmail: recipientEmail },
    });
  }

  async delete(
    organizationId: string,
    dcId: string,
    userId: string,
  ): Promise<void> {
    const dc = await this.findById(organizationId, dcId);
    dc.isDeleted = true;
    dc.deletedAt = new Date();
    await this.deliveryChallansRepository.save(dc);

    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'DeliveryChallan',
      entityId: dcId,
      action: AuditAction.DELETE,
      changes: { challanNumber: dc.challanNumber },
    });
  }
}
