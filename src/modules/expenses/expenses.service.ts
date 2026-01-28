import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from '../../entities/expense.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { Category } from '../../entities/category.entity';
import { Attachment } from '../../entities/attachment.entity';
import { Accrual } from '../../entities/accrual.entity';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseFilterDto } from './dto/expense-filter.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { LinkAccrualDto } from './dto/link-accrual.dto';
import { ExpenseType } from '../../common/enums/expense-type.enum';
import { ExpenseSource } from '../../common/enums/expense-source.enum';
import { AccrualStatus } from '../../common/enums/accrual-status.enum';
import { ExpenseType as ExpenseTypeEntity } from '../../entities/expense-type.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../common/enums/notification-type.enum';
import { NotificationChannel } from '../../common/enums/notification-channel.enum';
import { FileStorageService } from '../attachments/file-storage.service';
import { DuplicateDetectionService } from '../duplicates/duplicate-detection.service';
import { ForexRateService } from '../forex/forex-rate.service';
import { LicenseKeysService } from '../license-keys/license-keys.service';
import { SettingsService } from '../settings/settings.service';
import { Vendor } from '../vendors/vendor.entity';
import { Product } from '../products/product.entity';
import { InventoryService } from '../inventory/inventory.service';
import { StockMovementType } from '../../common/enums/stock-movement-type.enum';
import { PlanType } from '../../common/enums/plan-type.enum';
import { Repository as TypeOrmRepository } from 'typeorm';
import { ConflictException, Optional, Inject } from '@nestjs/common';
import { PurchaseLineItem } from '../../entities/purchase-line-item.entity';
import { PurchaseLineItemDto } from './dto/purchase-line-item.dto';
import { TaxRulesService } from '../tax-rules/tax-rules.service';
import { ExpensePayment } from '../../entities/expense-payment.entity';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { PurchaseOrder } from '../../entities/purchase-order.entity';

const DEFAULT_ACCRUAL_TOLERANCE = Number(
  process.env.ACCRUAL_AMOUNT_TOLERANCE ?? 5,
);

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    @InjectRepository(Attachment)
    private readonly attachmentsRepository: Repository<Attachment>,
    @InjectRepository(Accrual)
    private readonly accrualsRepository: Repository<Accrual>,
    @InjectRepository(Vendor)
    private readonly vendorsRepository: TypeOrmRepository<Vendor>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(PurchaseLineItem)
    private readonly lineItemsRepository: Repository<PurchaseLineItem>,
    @InjectRepository(ExpensePayment)
    private readonly expensePaymentsRepository: Repository<ExpensePayment>,
    private readonly notificationsService: NotificationsService,
    private readonly fileStorageService: FileStorageService,
    private readonly duplicateDetectionService: DuplicateDetectionService,
    private readonly forexRateService: ForexRateService,
    private readonly licenseKeysService: LicenseKeysService,
    private readonly settingsService: SettingsService,
    private readonly inventoryService: InventoryService,
    @Optional()
    @Inject(TaxRulesService)
    private readonly taxRulesService?: TaxRulesService,
  ) {}

  /**
   * Calculate VAT amount based on tax settings
   * Supports both inclusive and exclusive tax calculation methods
   * For reverse charge: VAT is calculated but NOT added to total (customer self-accounts)
   *
   * Enhanced: Uses TaxRulesService if available, falls back to standard calculation
   */
  private async calculateVatAmount(
    organizationId: string,
    amount: number,
    taxRate?: number,
    vatTaxType?: string,
    categoryId?: string,
    categoryName?: string,
  ): Promise<{
    vatAmount: number;
    baseAmount: number;
    isReverseCharge: boolean;
  }> {
    // Try enhanced tax calculation if tax rules service is available
    if (this.taxRulesService) {
      try {
        const organization = await this.organizationsRepository.findOne({
          where: { id: organizationId },
          select: ['region'],
        });

        const taxSettings =
          await this.settingsService.getTaxSettings(organizationId);
        const calculationMethod =
          taxSettings.taxCalculationMethod || 'inclusive';

        const result = await this.taxRulesService.calculateTax({
          amount,
          organizationId,
          region: organization?.region as any,
          categoryId,
          categoryName,
          taxRate,
          vatTaxType,
          calculationMethod: calculationMethod as 'inclusive' | 'exclusive',
        });

        return {
          vatAmount: result.vatAmount,
          baseAmount: result.baseAmount,
          isReverseCharge: result.isReverseCharge,
        };
      } catch (error) {
        // If tax rules service fails, fall back to standard calculation
        console.warn(
          'Tax rules service error, falling back to standard calculation:',
          error,
        );
      }
    }

    // Standard calculation (backward compatible)
    // Get tax settings
    const taxSettings =
      await this.settingsService.getTaxSettings(organizationId);
    const calculationMethod = taxSettings.taxCalculationMethod || 'inclusive';
    const defaultTaxRate = taxSettings.taxDefaultRate || 5;

    // Check if reverse charge applies
    const isReverseCharge = vatTaxType === 'reverse_charge';

    let vatAmount: number;
    let baseAmount: number;
    let effectiveTaxRate: number;

    if (isReverseCharge) {
      // Reverse charge: use reverse charge rate from settings
      effectiveTaxRate =
        taxSettings.taxReverseChargeRate || taxSettings.taxDefaultRate || 5;
      // For reverse charge, VAT is always calculated on the base amount (exclusive)
      vatAmount = (amount * effectiveTaxRate) / 100;
      baseAmount = amount; // Total = base amount (VAT not added)
    } else if (vatTaxType === 'zero_rated' || vatTaxType === 'exempt') {
      // Zero rated or exempt: no VAT
      vatAmount = 0;
      baseAmount = amount;
      effectiveTaxRate = 0;
    } else {
      // Standard VAT calculation
      effectiveTaxRate = taxRate ?? defaultTaxRate;

      if (calculationMethod === 'inclusive') {
        // Tax is included in the amount
        // VAT = Amount * (TaxRate / (100 + TaxRate))
        // Base = Amount - VAT
        vatAmount = (amount * effectiveTaxRate) / (100 + effectiveTaxRate);
        baseAmount = amount - vatAmount;
      } else {
        // Tax is exclusive (added on top)
        // VAT = Amount * (TaxRate / 100)
        // Base = Amount
        vatAmount = (amount * effectiveTaxRate) / 100;
        baseAmount = amount;
      }
    }

    // Apply rounding method (except for zero/exempt)
    if (
      !isReverseCharge &&
      vatTaxType !== 'zero_rated' &&
      vatTaxType !== 'exempt'
    ) {
      const roundingMethod = taxSettings.taxRoundingMethod || 'standard';
      if (roundingMethod === 'up') {
        vatAmount = Math.ceil(vatAmount * 100) / 100;
      } else if (roundingMethod === 'down') {
        vatAmount = Math.floor(vatAmount * 100) / 100;
      } else {
        // standard rounding
        vatAmount = Math.round(vatAmount * 100) / 100;
      }

      // Recalculate base amount for inclusive to ensure consistency
      if (calculationMethod === 'inclusive') {
        baseAmount = amount - vatAmount;
      }
    }

    return { vatAmount, baseAmount, isReverseCharge };
  }

  /**
   * Get default tax rate from settings or tax rates table
   */
  private async getDefaultTaxRate(organizationId: string): Promise<number> {
    // First, try to get active tax rates
    const taxRates = await this.settingsService.getTaxRates(organizationId);
    const activeStandardRate = taxRates.find(
      (rate) => rate.isActive && rate.type === 'standard',
    );

    if (activeStandardRate) {
      return activeStandardRate.rate;
    }

    // Fall back to default rate from settings
    const taxSettings =
      await this.settingsService.getTaxSettings(organizationId);
    return taxSettings.taxDefaultRate || 5;
  }

  private formatMoney(value: number | undefined): string {
    return Number(value ?? 0).toFixed(2);
  }

  async findAll(
    organizationId: string,
    filters: ExpenseFilterDto,
  ): Promise<Expense[]> {
    const query = this.expensesRepository
      .createQueryBuilder('expense')
      .leftJoinAndSelect('expense.category', 'category')
      .leftJoinAndSelect('expense.user', 'user')
      .leftJoinAndSelect('expense.vendor', 'vendor')
      .leftJoinAndSelect('expense.attachments', 'attachments')
      .leftJoinAndSelect('expense.accrualDetail', 'accrualDetail')
      .leftJoinAndSelect('expense.lineItems', 'lineItems')
      .leftJoinAndSelect('lineItems.product', 'lineItemProduct')
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false');

    if (filters.startDate) {
      query.andWhere('expense.expense_date >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters.endDate) {
      query.andWhere('expense.expense_date <= :endDate', {
        endDate: filters.endDate,
      });
    }
    if (filters.categoryId) {
      query.andWhere('expense.category_id = :categoryId', {
        categoryId: filters.categoryId,
      });
    }
    if (filters.type) {
      query.andWhere('expense.type = :type', { type: filters.type });
    }
    if (filters.vendorName) {
      query.andWhere('LOWER(expense.vendor_name) LIKE :vendorName', {
        vendorName: `%${filters.vendorName.toLowerCase()}%`,
      });
    }
    if (filters.createdBy) {
      query.andWhere('expense.user_id = :createdBy', {
        createdBy: filters.createdBy,
      });
    }
    if (filters.currency) {
      query.andWhere('expense.currency = :currency', {
        currency: filters.currency,
      });
    }
    if (filters.vendorId) {
      query.andWhere('expense.vendor_id = :vendorId', {
        vendorId: filters.vendorId,
      });
    }

    query.orderBy('expense.expense_date', 'DESC');

    return query.getMany();
  }

  async findById(id: string, organizationId: string): Promise<Expense> {
    const expense = await this.expensesRepository.findOne({
      where: { id, organization: { id: organizationId }, isDeleted: false },
      relations: [
        'category',
        'user',
        'attachments',
        'accrualDetail',
        'vendor',
        'lineItems',
        'lineItems.product',
        'expenseType', // Include custom expense type relation
      ],
    });
    if (!expense) {
      throw new NotFoundException('Expense not found');
    }
    return expense;
  }

  async create(
    organizationId: string,
    userId: string,
    dto: CreateExpenseDto,
  ): Promise<Expense> {
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

    const effectiveType: ExpenseType =
      (dto.type as ExpenseType) ?? ExpenseType.EXPENSE;

    // Resolve custom expense type (optional). This supports user-defined types while keeping `type` enum valid.
    let customExpenseType: ExpenseTypeEntity | null = null;
    if (dto.expenseTypeId) {
      customExpenseType = await this.expensesRepository.manager.findOne(
        ExpenseTypeEntity,
        {
          where: {
            id: dto.expenseTypeId,
            organization: { id: organizationId },
            isDeleted: false,
          },
        },
      );
      if (!customExpenseType) {
        throw new NotFoundException('Expense type not found');
      }
    }

    if (effectiveType === ExpenseType.ACCRUAL && !dto.expectedPaymentDate) {
      throw new BadRequestException(
        'Accrual expenses require expected payment date',
      );
    }

    let category: Category | null = null;
    if (dto.categoryId) {
      category = await this.categoriesRepository.findOne({
        where: { id: dto.categoryId, organization: { id: organizationId } },
      });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    // Check for duplicate expenses BEFORE creating
    const duplicates = await this.duplicateDetectionService.detectDuplicates(
      organizationId,
      dto.vendorName || null,
      dto.amount,
      dto.expenseDate,
      dto.ocrConfidence,
      dto.attachments,
    );

    if (
      duplicates.length > 0 &&
      this.duplicateDetectionService.shouldBlock(duplicates)
    ) {
      throw new ConflictException({
        message: 'Potential duplicate expense detected',
        duplicates: duplicates.map((d) => ({
          id: d.expense.id,
          vendorName: d.expense.vendorName,
          amount: d.expense.amount,
          date: d.expense.expenseDate,
          similarityScore: d.similarityScore,
          matchReason: d.matchReason,
        })),
      });
    }

    // Handle vendor linking
    let vendor = null;
    if (dto.vendorId) {
      vendor = await this.vendorsRepository.findOne({
        where: { id: dto.vendorId, organization: { id: organizationId } },
      });
      if (!vendor) {
        throw new NotFoundException('Vendor not found');
      }
      // Use vendor name from entity
      dto.vendorName = vendor.name;
      dto.vendorTrn = vendor.vendorTrn || dto.vendorTrn;
    } else if (dto.vendorName) {
      // Try to find or create vendor
      vendor = await this.linkOrCreateVendor(
        organization,
        dto.vendorName,
        dto.vendorTrn,
      );
    }

    // Determine VAT tax type (reverse charge, zero-rated, exempt, or standard)
    let vatTaxType = dto.vatTaxType || 'standard';

    // Auto-detect reverse charge eligibility if not explicitly set
    if (!dto.vatTaxType) {
      const taxSettings =
        await this.settingsService.getTaxSettings(organizationId);
      if (taxSettings.taxEnableReverseCharge) {
        // Check if vendor has TRN (B2B transaction eligible for reverse charge)
        const vendorTrn = vendor?.vendorTrn || dto.vendorTrn;
        if (vendorTrn) {
          // For UAE: B2B transactions with TRN are typically eligible for reverse charge
          // User can override this in the UI if needed
          vatTaxType = 'standard'; // Default to standard, user can change in UI
        }
      }
    }

    // Handle line items if provided (item-wise purchase entry)
    const lineItems: PurchaseLineItemDto[] | undefined = dto.lineItems;
    let vatAmount = dto.vatAmount;
    let expenseAmount = dto.amount;

    // If line items are provided, calculate totals from line items
    if (lineItems && lineItems.length > 0) {
      let totalAmount = 0;
      let totalVatAmount = 0;
      const defaultTaxRate = await this.getDefaultTaxRate(organizationId);
      const taxSettings =
        await this.settingsService.getTaxSettings(organizationId);
      const calculationMethod = taxSettings.taxCalculationMethod || 'inclusive';

      // Process each line item
      for (let i = 0; i < lineItems.length; i++) {
        const lineItem = lineItems[i];
        const lineAmount = lineItem.quantity * lineItem.unitPrice;

        // Get VAT rate for this line item
        let lineVatRate = lineItem.vatRate;
        if (!lineVatRate && lineItem.productId) {
          // Try to get VAT rate from product
          const product = await this.productsRepository.findOne({
            where: { id: lineItem.productId },
          });
          lineVatRate = product?.vatRate
            ? parseFloat(product.vatRate)
            : defaultTaxRate;
        } else if (!lineVatRate) {
          lineVatRate = defaultTaxRate;
        }

        // Calculate VAT for this line item
        const lineVatTaxType = lineItem.vatTaxType || vatTaxType;
        let lineVatAmount = 0;

        if (lineVatTaxType === 'zero_rated' || lineVatTaxType === 'exempt') {
          lineVatAmount = 0;
        } else if (lineVatTaxType === 'reverse_charge') {
          // Reverse charge: VAT is calculated but not added to total
          lineVatAmount = (lineAmount * lineVatRate) / 100;
        } else {
          // Standard VAT calculation
          if (calculationMethod === 'inclusive') {
            lineVatAmount = (lineAmount * lineVatRate) / (100 + lineVatRate);
          } else {
            lineVatAmount = (lineAmount * lineVatRate) / 100;
          }
        }

        totalAmount += lineAmount;
        totalVatAmount += lineVatAmount;
      }

      // Set calculated totals
      expenseAmount = totalAmount;
      vatAmount = totalVatAmount;
    } else {
      // Auto-calculate VAT if not provided or explicitly set to 0
      // This handles cases where user sets vatAmount = 0 but wants auto-calculation
      if (vatAmount === undefined || vatAmount === null || vatAmount === 0) {
        // Auto-calculate VAT from tax settings
        const defaultTaxRate = await this.getDefaultTaxRate(organizationId);
        const taxCalculation = await this.calculateVatAmount(
          organizationId,
          dto.amount,
          defaultTaxRate,
          vatTaxType,
          category?.id,
          category?.name,
        );
        vatAmount = taxCalculation.vatAmount;
        // For inclusive tax, amount should be base amount (without VAT)
        // For exclusive tax, amount stays as entered (base amount)
        expenseAmount = taxCalculation.baseAmount;
      }
    }

    // Handle currency and conversion (use final expense amount after tax calculation)
    const expenseCurrency = dto.currency || organization.currency || 'AED';
    const baseCurrency =
      organization.baseCurrency || organization.currency || 'AED';
    let exchangeRate: string | null = null;
    let baseAmount: string | null = null;

    if (expenseCurrency !== baseCurrency) {
      const expenseDate = new Date(dto.expenseDate);
      const rate = await this.forexRateService.getRate(
        organization,
        expenseCurrency,
        baseCurrency,
        expenseDate,
      );
      exchangeRate = rate.toFixed(6);
      // Convert the expense amount (base amount) to base currency
      baseAmount = (
        await this.forexRateService.convert(
          organization,
          expenseAmount,
          expenseCurrency,
          baseCurrency,
          expenseDate,
        )
      ).toFixed(2);
    } else {
      exchangeRate = '1.000000';
      baseAmount = this.formatMoney(expenseAmount);
    }

    let linkedAccrualExpense: Expense | null = null;
    if (dto.linkedAccrualExpenseId) {
      linkedAccrualExpense = await this.expensesRepository.findOne({
        where: {
          id: dto.linkedAccrualExpenseId,
          organization: { id: organizationId },
          type: ExpenseType.ACCRUAL,
        },
        relations: ['accrualDetail'],
      });
      if (!linkedAccrualExpense || !linkedAccrualExpense.accrualDetail) {
        throw new BadRequestException(
          'Linked accrual expense not found or missing accrual detail',
        );
      }
    }

    // Resolve purchase order if provided
    let purchaseOrder = null;
    if (dto.purchaseOrderId) {
      purchaseOrder = await this.expensesRepository.manager.findOne(PurchaseOrder, {
        where: { id: dto.purchaseOrderId, organization: { id: organizationId } },
      });
      if (!purchaseOrder) {
        throw new NotFoundException('Purchase order not found');
      }
    }

    const expense = this.expensesRepository.create({
      organization,
      user,
      type: effectiveType,
      expenseType: customExpenseType,
      category: category ?? null,
      vendor: vendor,
      amount: this.formatMoney(expenseAmount),
      vatAmount: this.formatMoney(vatAmount),
      vatTaxType: vatTaxType as any, // Store VAT tax type
      currency: expenseCurrency,
      exchangeRate: exchangeRate,
      baseAmount: baseAmount,
      expenseDate: dto.expenseDate,
      expectedPaymentDate: dto.expectedPaymentDate ?? null,
      purchaseStatus: dto.purchaseStatus ?? null,
      vendorName: dto.vendorName, // Keep for backward compatibility
      vendorTrn: dto.vendorTrn,
      invoiceNumber: dto.invoiceNumber ?? null,
      description: dto.description,
      source: dto.source ?? ExpenseSource.MANUAL,
      ocrConfidence:
        dto.ocrConfidence !== undefined ? dto.ocrConfidence.toFixed(2) : null,
      linkedAccrual: linkedAccrualExpense ?? null,
      purchaseOrder: purchaseOrder,
      purchaseOrderId: dto.purchaseOrderId ?? null,
      product: dto.productId ? { id: dto.productId } : null,
      productId: dto.productId ?? null,
      quantity: dto.quantity ? dto.quantity.toString() : null,
      isInventoryPurchase: dto.isInventoryPurchase ?? false,
      // Note: totalAmount is a generated column (amount + vat_amount) and cannot be set manually
      // For reverse charge, we'll update it after saving (see below)
    });

    // Check upload limit before creating attachments
    if (dto.attachments?.length) {
      const uploadLimitCheck = await this.licenseKeysService.checkUploadLimit(
        organizationId,
        dto.attachments.length,
      );
      if (!uploadLimitCheck.allowed) {
        throw new BadRequestException(
          `Upload limit exceeded. You have ${uploadLimitCheck.remaining} uploads remaining out of ${uploadLimitCheck.totalAllowed} total allowed. Please contact your administrator or sales team to request additional uploads. Email: support@selfaccounting.ai`,
        );
      }
    }

    // Save expense - totalAmount is automatically calculated by the database (generated column: amount + vat_amount)
    // Note: For reverse charge, the generated column will include VAT in totalAmount, but that's acceptable
    // as the VAT is tracked separately and reverse charge logic is handled in reporting/accounting
    const saved = await this.expensesRepository.save(expense);

    // Then create and save attachments with the saved expense reference
    if (dto.attachments?.length) {
      const attachments = dto.attachments.map((attachment) => {
        // Extract fileKey from fileUrl if not provided
        let fileKey = attachment.fileKey;
        if (!fileKey && attachment.fileUrl) {
          fileKey = this.fileStorageService.extractFileKeyFromUrl(
            attachment.fileUrl,
          );
        }

        return this.attachmentsRepository.create({
          organization,
          fileName: attachment.fileName,
          fileUrl: attachment.fileUrl,
          fileKey: fileKey || null,
          fileType: attachment.fileType,
          fileSize: attachment.fileSize,
          uploadedBy: user,
          expense: saved, // Use saved expense with ID
        });
      });
      await this.attachmentsRepository.save(attachments);
    }

    // Create line items if provided
    if (lineItems && lineItems.length > 0) {
      const defaultTaxRate = await this.getDefaultTaxRate(organizationId);
      const taxSettings =
        await this.settingsService.getTaxSettings(organizationId);
      const calculationMethod = taxSettings.taxCalculationMethod || 'inclusive';

      const lineItemEntities = await Promise.all(
        lineItems.map(async (lineItemDto, index) => {
          // Get product if productId is provided
          let product: Product | null = null;
          if (lineItemDto.productId) {
            product = await this.productsRepository.findOne({
              where: {
                id: lineItemDto.productId,
                organization: { id: organizationId },
              },
            });
          }

          // Calculate line item amounts
          const lineAmount = lineItemDto.quantity * lineItemDto.unitPrice;

          // Get VAT rate
          let lineVatRate = lineItemDto.vatRate;
          if (!lineVatRate && product) {
            lineVatRate = product.vatRate
              ? parseFloat(product.vatRate)
              : defaultTaxRate;
          } else if (!lineVatRate) {
            lineVatRate = defaultTaxRate;
          }

          // Calculate VAT for this line item
          const lineVatTaxType = lineItemDto.vatTaxType || vatTaxType;
          let lineVatAmount = 0;

          if (lineVatTaxType === 'zero_rated' || lineVatTaxType === 'exempt') {
            lineVatAmount = 0;
          } else if (lineVatTaxType === 'reverse_charge') {
            lineVatAmount = (lineAmount * lineVatRate) / 100;
          } else {
            if (calculationMethod === 'inclusive') {
              lineVatAmount = (lineAmount * lineVatRate) / (100 + lineVatRate);
            } else {
              lineVatAmount = (lineAmount * lineVatRate) / 100;
            }
          }

          // Round VAT amount
          const roundingMethod = taxSettings.taxRoundingMethod || 'standard';
          if (roundingMethod === 'up') {
            lineVatAmount = Math.ceil(lineVatAmount * 100) / 100;
          } else if (roundingMethod === 'down') {
            lineVatAmount = Math.floor(lineVatAmount * 100) / 100;
          } else {
            lineVatAmount = Math.round(lineVatAmount * 100) / 100;
          }

          return this.lineItemsRepository.create({
            expense: saved,
            product: product || null,
            productId: lineItemDto.productId || null,
            itemName: lineItemDto.itemName,
            sku: product?.sku || lineItemDto.sku || null,
            quantity: lineItemDto.quantity.toString(),
            unitOfMeasure:
              lineItemDto.unitOfMeasure || product?.unitOfMeasure || 'unit',
            unitPrice: lineItemDto.unitPrice.toString(),
            amount: lineAmount.toString(),
            vatRate: lineVatRate.toString(),
            vatAmount: lineVatAmount.toString(),
            vatTaxType: lineVatTaxType as any,
            description: lineItemDto.description || null,
            lineNumber: index + 1,
          });
        }),
      );

      await this.lineItemsRepository.save(lineItemEntities);
    }

    // Create accrual if type is ACCRUAL OR purchaseStatus is "Purchase - Accruals"
    if (
      effectiveType === ExpenseType.ACCRUAL ||
      dto.purchaseStatus === 'Purchase - Accruals'
    ) {
      // Ensure expected payment date is provided for accruals
      if (!dto.expectedPaymentDate) {
        throw new BadRequestException(
          'Expected payment date is required for accrual expenses',
        );
      }

      const accrual = this.accrualsRepository.create({
        expense: saved,
        organization,
        vendorName: saved.vendorName,
        amount: saved.totalAmount, // Use totalAmount (includes VAT) - this is the amount owed to vendor
        expectedPaymentDate: dto.expectedPaymentDate ?? dto.expenseDate,
        status: AccrualStatus.PENDING_SETTLEMENT,
      });
      await this.accrualsRepository.save(accrual);
      if (accrual.expectedPaymentDate) {
        await this.notificationsService.scheduleNotification({
          organizationId,
          userId,
          title: 'Accrual Payment Reminder',
          message: `Accrual for ${saved.vendorName ?? 'vendor'} due on ${
            accrual.expectedPaymentDate
          }`,
          type: NotificationType.ACCRUAL_REMINDER,
          channel: NotificationChannel.EMAIL,
          scheduledFor: this.notificationsService.calculateReminderDate(
            accrual.expectedPaymentDate,
          ),
        });
      }
    }

    // Auto-create payment record for cash-paid expenses
    // This ensures trial balance stays balanced by creating the credit entry
    if (dto.purchaseStatus === 'Purchase - Cash Paid') {
      // Check if payment record already exists (avoid duplicates)
      // CRITICAL: Filter by is_deleted = false to avoid finding deleted payments
      const existingPayments = await this.expensePaymentsRepository.find({
        where: {
          expense: { id: saved.id },
          organization: { id: organizationId },
          isDeleted: false, // Only check non-deleted payments
        },
      });

      // Only create if no payment record exists
      if (existingPayments.length === 0) {
        const payment = this.expensePaymentsRepository.create({
          expense: saved,
          organization: { id: organizationId },
          paymentDate: dto.expenseDate, // Use expense date as payment date
          amount: saved.totalAmount, // Use total amount (includes VAT)
          paymentMethod: PaymentMethod.CASH,
          notes: `Auto-created payment for cash-paid expense: ${saved.vendorName || 'N/A'}`,
          isDeleted: false, // Explicitly set to ensure it's not filtered out
        });
        await this.expensePaymentsRepository.save(payment);
      }
    }

    if (linkedAccrualExpense) {
      await this.linkExpenseToAccrual(saved, linkedAccrualExpense);
    } else if (
      effectiveType !== ExpenseType.ACCRUAL &&
      (effectiveType === ExpenseType.EXPENSE ||
        effectiveType === ExpenseType.CREDIT) &&
      dto.vendorName &&
      dto.amount
    ) {
      // Try to auto-match with pending accruals (works for both expenses and credits)
      await this.autoMatchAccrual(saved, organizationId);
    }

    // Update vendor last used date if linked
    if (vendor) {
      vendor.lastUsedAt = new Date();
      await this.vendorsRepository.save(vendor);
    }

    // Record stock movements for inventory purchases
    // Handle both single product (legacy) and line items
    const org = await this.organizationsRepository.findOne({
      where: { id: organizationId },
      select: ['id', 'planType'],
    });

    const hasInventoryAccess =
      org?.planType === PlanType.PREMIUM ||
      org?.planType === PlanType.ENTERPRISE;

    if (hasInventoryAccess) {
      try {
        const locations =
          await this.inventoryService.findAllLocations(organizationId);

        if (locations.length > 0) {
          const location = locations.find((l) => l.isDefault) || locations[0];

          if (location) {
            // Handle line items with products
            if (lineItems && lineItems.length > 0) {
              for (const lineItemDto of lineItems) {
                if (lineItemDto.productId && lineItemDto.quantity > 0) {
                  const unitCost = lineItemDto.unitPrice;

                  try {
                    await this.inventoryService.recordStockMovement(
                      organizationId,
                      userId,
                      {
                        productId: lineItemDto.productId,
                        locationId: location.id,
                        movementType: StockMovementType.PURCHASE,
                        quantity: lineItemDto.quantity,
                        unitCost,
                        referenceType: 'expense',
                        referenceId: saved.id,
                        notes: `Purchase via expense ${saved.invoiceNumber || saved.id} - ${lineItemDto.itemName}`,
                      },
                    );
                    console.log(
                      `Stock movement created for expense ${saved.id}, product ${lineItemDto.productId}, quantity ${lineItemDto.quantity}`,
                    );
                  } catch (stockError) {
                    console.error(
                      `Failed to create stock movement for line item: ${stockError.message}`,
                      stockError,
                    );
                    // Continue with other line items even if one fails
                  }

                  // Update product cost price
                  const product = await this.productsRepository.findOne({
                    where: { id: lineItemDto.productId },
                  });
                  if (product) {
                    // Update cost price (simple average for now)
                    await this.productsRepository.update(
                      { id: lineItemDto.productId },
                      {
                        costPrice: unitCost.toString(),
                        averageCost: unitCost.toString(),
                      },
                    );
                  }
                }
              }
            } else if (
              // Legacy: single product purchase
              dto.isInventoryPurchase &&
              dto.productId &&
              dto.quantity &&
              dto.quantity > 0
            ) {
              const unitCost =
                dto.quantity > 0 ? expenseAmount / dto.quantity : expenseAmount;

              await this.inventoryService.recordStockMovement(
                organizationId,
                userId,
                {
                  productId: dto.productId,
                  locationId: location.id,
                  movementType: StockMovementType.PURCHASE,
                  quantity: dto.quantity,
                  unitCost,
                  referenceType: 'expense',
                  referenceId: saved.id,
                  notes: `Purchase via expense ${saved.invoiceNumber || saved.id}`,
                },
              );

              // Update product cost price
              const product = await this.productsRepository.findOne({
                where: { id: dto.productId },
              });
              if (product) {
                await this.productsRepository.update(
                  { id: dto.productId },
                  {
                    costPrice: unitCost.toString(),
                    averageCost: unitCost.toString(),
                  },
                );
              }
            }
          }
        }
      } catch (error) {
        // Log error but don't fail expense creation
        console.error(
          `Failed to record stock movement for expense ${saved.id}: ${error.message}`,
          error,
        );
      }
    }

    return this.findById(saved.id, organizationId);
  }

  /**
   * Check for duplicate expenses without creating
   */
  async checkDuplicates(
    organizationId: string,
    dto: CreateExpenseDto,
  ): Promise<{ duplicates: any[]; hasDuplicates: boolean }> {
    const duplicates = await this.duplicateDetectionService.detectDuplicates(
      organizationId,
      dto.vendorName || null,
      dto.amount,
      dto.expenseDate,
      dto.ocrConfidence,
      dto.attachments,
    );

    return {
      duplicates: duplicates.map((d) => ({
        id: d.expense.id,
        vendorName: d.expense.vendorName,
        amount: d.expense.amount,
        date: d.expense.expenseDate,
        similarityScore: d.similarityScore,
        matchReason: d.matchReason,
        confidence: d.confidence,
      })),
      hasDuplicates: duplicates.length > 0,
    };
  }

  /**
   * Clean vendor name by removing common prefixes like "To: ", "From: ", etc.
   */
  private cleanVendorName(vendorName: string | null | undefined): string {
    if (!vendorName) {
      return '';
    }

    let cleaned = vendorName.trim();

    // Remove common prefixes
    const prefixes = ['To:', 'From:', 'Vendor:', 'Supplier:', 'Company:'];
    for (const prefix of prefixes) {
      if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
        cleaned = cleaned.substring(prefix.length).trim();
        break; // Only remove one prefix
      }
    }

    return cleaned;
  }

  /**
   * Link expense to existing vendor or create new vendor
   */
  private async linkOrCreateVendor(
    organization: Organization,
    vendorName: string,
    vendorTrn?: string,
  ): Promise<Vendor | null> {
    if (!vendorName) {
      return null;
    }

    // Clean vendor name before processing
    const cleanedVendorName = this.cleanVendorName(vendorName);
    if (!cleanedVendorName) {
      return null;
    }

    // Try to find existing vendor by name (fuzzy match)
    const existingVendors = await this.vendorsRepository.find({
      where: {
        organization: { id: organization.id },
        isActive: true,
      },
    });

    const matchedVendor = existingVendors.find((v) => {
      const v1 = v.name.toLowerCase().trim();
      const v2 = cleanedVendorName.toLowerCase().trim();
      return (
        v1 === v2 ||
        v1.includes(v2) ||
        v2.includes(v1) ||
        this.levenshteinDistance(v1, v2) / Math.max(v1.length, v2.length) < 0.15
      );
    });

    if (matchedVendor) {
      return matchedVendor;
    }

    // Create new vendor with cleaned name
    const vendor = this.vendorsRepository.create({
      organization,
      name: cleanedVendorName,
      vendorTrn: vendorTrn || null,
      preferredCurrency: organization.currency || 'AED',
      firstUsedAt: new Date(),
      lastUsedAt: new Date(),
      isActive: true,
    });

    return this.vendorsRepository.save(vendor);
  }

  /**
   * Calculate Levenshtein distance for vendor name matching
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }

  private async autoMatchAccrual(
    expense: Expense,
    organizationId: string,
  ): Promise<void> {
    if (!expense.vendorName || !expense.amount) {
      return;
    }

    // Find pending accruals with matching vendor and similar amount
    const pendingAccruals = await this.accrualsRepository.find({
      where: {
        organization: { id: organizationId },
        status: AccrualStatus.PENDING_SETTLEMENT,
      },
      relations: ['expense'],
      order: {
        expectedPaymentDate: 'ASC', // Prioritize older accruals
      },
    });

    if (pendingAccruals.length === 0) {
      return;
    }

    const expenseAmount = Number(expense.totalAmount); // Use totalAmount (includes VAT) to match accrual.amount
    const expenseVendor = expense.vendorName.toLowerCase().trim();
    const expenseDate = new Date(expense.expenseDate);

    let bestMatch: { accrual: Accrual; score: number } | null = null;

    for (const accrual of pendingAccruals) {
      if (!accrual.vendorName) {
        continue;
      }

      const accrualAmount = Number(accrual.amount); // accrual.amount is now totalAmount (includes VAT)
      const accrualVendor = accrual.vendorName.toLowerCase().trim();
      const accrualExpectedDate = new Date(accrual.expectedPaymentDate);

      // 1. Vendor name matching (case-insensitive, supports partial matches)
      const vendorMatch = this.matchVendorNames(expenseVendor, accrualVendor);
      if (!vendorMatch) {
        continue;
      }

      // 2. Amount matching (within tolerance)
      const amountDiff = Math.abs(accrualAmount - expenseAmount);
      const tolerance = DEFAULT_ACCRUAL_TOLERANCE;
      if (amountDiff > tolerance) {
        continue;
      }

      // 3. Calculate match score (lower is better)
      // Score factors:
      // - Amount difference (0-5 points)
      // - Date proximity (0-10 points, closer dates score better)
      // - Vendor name exactness (0-5 points)
      const amountScore = (amountDiff / tolerance) * 5; // 0-5 points
      const daysDiff = Math.abs(
        (expenseDate.getTime() - accrualExpectedDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      const dateScore = Math.min(daysDiff / 30, 1) * 10; // 0-10 points (30 days = max)
      const vendorScore = expenseVendor === accrualVendor ? 0 : 2; // Exact match = 0, partial = 2

      const totalScore = amountScore + dateScore + vendorScore;

      if (!bestMatch || totalScore < bestMatch.score) {
        bestMatch = { accrual, score: totalScore };
      }
    }

    // Auto-link if we found a good match (score < 10 indicates good match)
    if (bestMatch && bestMatch.score < 10) {
      console.log(
        `Auto-matching expense ${expense.id} to accrual ${bestMatch.accrual.id} (score: ${bestMatch.score.toFixed(2)})`,
      );
      await this.linkExpenseToAccrual(
        expense,
        bestMatch.accrual.expense,
        true, // Mark as auto-settled
      );
    }
  }

  /**
   * Match vendor names with fuzzy logic
   * Supports:
   * - Exact match
   * - One contains the other
   * - Similar names (removes common words like "LLC", "Inc", etc.)
   */
  private matchVendorNames(vendor1: string, vendor2: string): boolean {
    // Exact match
    if (vendor1 === vendor2) {
      return true;
    }

    // One contains the other (for partial matches)
    if (vendor1.includes(vendor2) || vendor2.includes(vendor1)) {
      return true;
    }

    // Normalize vendor names (remove common suffixes/prefixes)
    const normalize = (name: string) => {
      return name
        .replace(/\b(llc|inc|corp|limited|ltd|company|co)\b/gi, '')
        .replace(/[^\w\s]/g, '')
        .trim();
    };

    const normalized1 = normalize(vendor1);
    const normalized2 = normalize(vendor2);

    // Check if normalized names match or contain each other
    if (normalized1 && normalized2) {
      if (normalized1 === normalized2) {
        return true;
      }
      if (
        normalized1.includes(normalized2) ||
        normalized2.includes(normalized1)
      ) {
        return true;
      }
    }

    return false;
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateExpenseDto,
  ): Promise<Expense> {
    const expense = await this.findById(id, organizationId);

    if (dto.categoryId) {
      const category = await this.categoriesRepository.findOne({
        where: { id: dto.categoryId, organization: { id: organizationId } },
      });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
      expense.category = category;
    }

    if (dto.type) {
      expense.type = dto.type;
    }

    // Update custom expense type link if provided
    if (dto.expenseTypeId !== undefined) {
      const expenseTypeId = dto.expenseTypeId as string | null;
      if (expenseTypeId) {
        const customExpenseType = await this.expensesRepository.manager.findOne(
          ExpenseTypeEntity,
          {
            where: {
              id: expenseTypeId,
              organization: { id: organizationId },
              isDeleted: false,
            },
          },
        );
        if (!customExpenseType) {
          throw new NotFoundException('Expense type not found');
        }
        expense.expenseType = customExpenseType;
      } else {
        expense.expenseType = null;
      }
    }

    // Update VAT tax type if provided
    if (dto.vatTaxType !== undefined) {
      expense.vatTaxType = dto.vatTaxType as any;
    }
    const currentVatTaxType =
      expense.vatTaxType || dto.vatTaxType || 'standard';
    const isReverseCharge = currentVatTaxType === 'reverse_charge';

    // Recalculate VAT if amount changes and VAT not explicitly provided
    // Also recalculate if vatAmount is explicitly set to 0 (user wants auto-calculation)
    if (dto.amount !== undefined) {
      const newAmount = dto.amount;
      expense.amount = this.formatMoney(newAmount);

      // If VAT amount not explicitly provided or set to 0, recalculate from tax settings
      if (dto.vatAmount === undefined || dto.vatAmount === 0) {
        const defaultTaxRate = await this.getDefaultTaxRate(organizationId);
        // Load category if not already loaded
        if (!expense.category && expense.category) {
          expense.category = await this.categoriesRepository.findOne({
            where: { id: expense.category.id },
          });
        } else if (!expense.category) {
          // Try to load by relation
          const expenseWithCategory = await this.expensesRepository.findOne({
            where: { id: expense.id },
            relations: ['category'],
          });
          if (expenseWithCategory?.category) {
            expense.category = expenseWithCategory.category;
          }
        }
        const taxCalculation = await this.calculateVatAmount(
          organizationId,
          newAmount,
          defaultTaxRate,
          currentVatTaxType,
          expense.category?.id,
          expense.category?.name,
        );
        expense.vatAmount = this.formatMoney(taxCalculation.vatAmount);
        // Update amount to base amount for inclusive tax
        expense.amount = this.formatMoney(taxCalculation.baseAmount);
      }
    } else if (
      dto.vatTaxType !== undefined &&
      (dto.vatAmount === undefined || dto.vatAmount === 0)
    ) {
      // VAT tax type changed, recalculate VAT with new type
      // Also recalculate if vatAmount is explicitly set to 0
      const currentAmount = parseFloat(expense.amount);
      const defaultTaxRate = await this.getDefaultTaxRate(organizationId);
      // Load category if not already loaded
      if (!expense.category) {
        // Try to load by relation
        const expenseWithCategory = await this.expensesRepository.findOne({
          where: { id: expense.id },
          relations: ['category'],
        });
        if (expenseWithCategory?.category) {
          expense.category = expenseWithCategory.category;
        }
      }
      const taxCalculation = await this.calculateVatAmount(
        organizationId,
        currentAmount,
        defaultTaxRate,
        currentVatTaxType,
        expense.category?.id,
        expense.category?.name,
      );
      expense.vatAmount = this.formatMoney(taxCalculation.vatAmount);
      expense.amount = this.formatMoney(taxCalculation.baseAmount);
    }

    // Only set vatAmount if explicitly provided and not 0 (0 triggers auto-calculation above)
    if (dto.vatAmount !== undefined && dto.vatAmount !== 0) {
      expense.vatAmount = this.formatMoney(dto.vatAmount);
    }
    if (dto.expenseDate !== undefined) {
      expense.expenseDate = dto.expenseDate;
    }
    if (dto.expectedPaymentDate !== undefined) {
      expense.expectedPaymentDate = dto.expectedPaymentDate;
    }
    if (dto.vendorName !== undefined) {
      expense.vendorName = dto.vendorName;
    }
    if (dto.vendorTrn !== undefined) {
      expense.vendorTrn = dto.vendorTrn;
    }
    if (dto.invoiceNumber !== undefined) {
      expense.invoiceNumber = dto.invoiceNumber;
    }
    if (dto.description !== undefined) {
      expense.description = dto.description;
    }
    // Capture previous purchase status BEFORE updating (for payment auto-creation check)
    const previousPurchaseStatus = expense.purchaseStatus;

    if (dto.purchaseStatus !== undefined) {
      expense.purchaseStatus = dto.purchaseStatus;
    }

    if (dto.attachments) {
      expense.attachments = dto.attachments.map((attachment) =>
        this.attachmentsRepository.create({
          ...attachment,
          organization: expense.organization,
          uploadedBy: expense.user,
          expense,
        }),
      );
    }

    // Note: totalAmount is a generated column (amount + vat_amount) in the database
    // We cannot set it directly - it will be automatically calculated by PostgreSQL
    // For reverse charge cases, the generated column formula may need adjustment
    // but for now we let the database calculate it
    const saved = await this.expensesRepository.save(expense);

    // Calculate expected total for payment creation
    const expenseAmountNum = parseFloat(expense.amount || '0');
    const vatAmountNum = parseFloat(expense.vatAmount || '0');
    const calculatedTotalAmount = isReverseCharge
      ? expenseAmountNum // Reverse charge: total = base amount only (VAT not added)
      : expenseAmountNum + vatAmountNum; // Standard: total = base + VAT

    // Auto-create payment record if status changed to "Purchase - Cash Paid"
    // Do this AFTER saving to ensure we use the correct totalAmount
    if (
      dto.purchaseStatus !== undefined &&
      dto.purchaseStatus === 'Purchase - Cash Paid' &&
      previousPurchaseStatus !== 'Purchase - Cash Paid'
    ) {
      // Check if payment record already exists (avoid duplicates)
      // CRITICAL: Filter by is_deleted = false to avoid finding deleted payments
      const existingPayments = await this.expensePaymentsRepository.find({
        where: {
          expense: { id: saved.id },
          organization: { id: organizationId },
          isDeleted: false, // Only check non-deleted payments
        },
      });

      // Only create if no payment record exists
      if (existingPayments.length === 0) {
        // Use calculated total (accounting for reverse charge) or database-generated total
        const paymentAmount = isReverseCharge
          ? calculatedTotalAmount
          : saved.totalAmount
            ? parseFloat(saved.totalAmount)
            : calculatedTotalAmount;

        const payment = this.expensePaymentsRepository.create({
          expense: saved,
          organization: { id: organizationId },
          paymentDate: saved.expenseDate, // Use expense date as payment date
          amount: this.formatMoney(paymentAmount),
          paymentMethod: PaymentMethod.CASH,
          notes: `Auto-created payment for cash-paid expense: ${saved.vendorName || 'N/A'}`,
          isDeleted: false, // Explicitly set to ensure it's not filtered out
        });
        await this.expensePaymentsRepository.save(payment);
      }
    }

    // Try auto-matching accrual if vendor or amount was updated and expense is not already linked
    if (
      (dto.vendorName !== undefined || dto.amount !== undefined) &&
      expense.type !== ExpenseType.ACCRUAL &&
      (expense.type === ExpenseType.EXPENSE ||
        expense.type === ExpenseType.CREDIT) &&
      expense.vendorName &&
      expense.amount &&
      !expense.linkedAccrual // Only if not already linked
    ) {
      await this.autoMatchAccrual(expense, organizationId);
    }

    return this.findById(id, organizationId);
  }

  async linkAccrual(
    id: string,
    organizationId: string,
    dto: LinkAccrualDto,
  ): Promise<Expense> {
    const expense = await this.findById(id, organizationId);
    const accrualExpense = await this.expensesRepository.findOne({
      where: {
        id: dto.accrualExpenseId,
        organization: { id: organizationId },
        type: ExpenseType.ACCRUAL,
      },
      relations: ['accrualDetail'],
    });
    if (!accrualExpense || !accrualExpense.accrualDetail) {
      throw new BadRequestException('Accrual not found');
    }
    await this.linkExpenseToAccrual(expense, accrualExpense);
    return this.findById(id, organizationId);
  }

  private async linkExpenseToAccrual(
    expense: Expense,
    accrualExpense: Expense,
    isAutoMatched: boolean = false,
  ): Promise<void> {
    const accrual = await this.accrualsRepository.findOne({
      where: { expense: { id: accrualExpense.id } },
      relations: ['expense'],
    });
    if (!accrual) {
      throw new BadRequestException('Accrual detail not found');
    }

    // Check if accrual is already settled
    if (accrual.status !== AccrualStatus.PENDING_SETTLEMENT) {
      throw new BadRequestException('Accrual is already settled');
    }

    const accrualAmount = Number(accrual.amount); // accrual.amount is now totalAmount (includes VAT)
    const expenseAmount = Number(expense.totalAmount); // Compare with expense totalAmount (includes VAT)
    if (Math.abs(accrualAmount - expenseAmount) > DEFAULT_ACCRUAL_TOLERANCE) {
      throw new BadRequestException(
        `Settlement amount differs by more than ${DEFAULT_ACCRUAL_TOLERANCE}`,
      );
    }

    expense.linkedAccrual = accrualExpense;
    accrual.settlementExpense = expense;
    accrual.settlementDate = expense.expenseDate;

    // Mark as AUTO_SETTLED if auto-matched, otherwise SETTLED
    accrual.status = isAutoMatched
      ? AccrualStatus.AUTO_SETTLED
      : AccrualStatus.SETTLED;

    await Promise.all([
      this.expensesRepository.save(expense),
      this.accrualsRepository.save(accrual),
    ]);

    console.log(
      `Accrual ${accrual.id} ${isAutoMatched ? 'auto-' : ''}settled by expense ${expense.id}`,
    );
  }
}
