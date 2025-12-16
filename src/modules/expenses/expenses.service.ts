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
import { UpdateExpenseStatusDto } from './dto/update-status.dto';
import { LinkAccrualDto } from './dto/link-accrual.dto';
import { ExpenseType } from '../../common/enums/expense-type.enum';
import { ExpenseStatus } from '../../common/enums/expense-status.enum';
import { ExpenseSource } from '../../common/enums/expense-source.enum';
import { AccrualStatus } from '../../common/enums/accrual-status.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../common/enums/notification-type.enum';
import { NotificationChannel } from '../../common/enums/notification-channel.enum';
import { FileStorageService } from '../attachments/file-storage.service';
import { DuplicateDetectionService } from '../duplicates/duplicate-detection.service';
import { ForexRateService } from '../forex/forex-rate.service';
import { Vendor } from '../vendors/vendor.entity';
import { Repository as TypeOrmRepository } from 'typeorm';
import { ConflictException } from '@nestjs/common';

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
    private readonly notificationsService: NotificationsService,
    private readonly fileStorageService: FileStorageService,
    private readonly duplicateDetectionService: DuplicateDetectionService,
    private readonly forexRateService: ForexRateService,
  ) {}

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
    if (filters.status) {
      query.andWhere('expense.status = :status', {
        status: filters.status,
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
      relations: ['category', 'user', 'attachments', 'accrualDetail', 'vendor'],
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
    if (dto.type === ExpenseType.ACCRUAL && !dto.expectedPaymentDate) {
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

    // Handle currency and conversion
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
      baseAmount = (
        await this.forexRateService.convert(
          organization,
          dto.amount,
          expenseCurrency,
          baseCurrency,
          expenseDate,
        )
      ).toFixed(2);
    } else {
      exchangeRate = '1.000000';
      baseAmount = this.formatMoney(dto.amount);
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

    const expense = this.expensesRepository.create({
      organization,
      user,
      type: dto.type,
      category: category ?? null,
      vendor: vendor,
      amount: this.formatMoney(dto.amount),
      vatAmount: this.formatMoney(dto.vatAmount),
      currency: expenseCurrency,
      exchangeRate: exchangeRate,
      baseAmount: baseAmount,
      expenseDate: dto.expenseDate,
      expectedPaymentDate: dto.expectedPaymentDate ?? null,
      vendorName: dto.vendorName, // Keep for backward compatibility
      vendorTrn: dto.vendorTrn,
      description: dto.description,
      status: ExpenseStatus.PENDING,
      source: dto.source ?? ExpenseSource.MANUAL,
      ocrConfidence:
        dto.ocrConfidence !== undefined ? dto.ocrConfidence.toFixed(2) : null,
      linkedAccrual: linkedAccrualExpense ?? null,
    });

    // Save expense first to get the ID
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

    if (dto.type === ExpenseType.ACCRUAL) {
      const accrual = this.accrualsRepository.create({
        expense: saved,
        organization,
        vendorName: saved.vendorName,
        amount: saved.amount,
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

    if (linkedAccrualExpense) {
      await this.linkExpenseToAccrual(saved, linkedAccrualExpense);
    } else if (
      dto.type !== ExpenseType.ACCRUAL &&
      (dto.type === ExpenseType.EXPENSE || dto.type === ExpenseType.CREDIT) &&
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

    const expenseAmount = Number(expense.amount);
    const expenseVendor = expense.vendorName.toLowerCase().trim();
    const expenseDate = new Date(expense.expenseDate);

    let bestMatch: { accrual: Accrual; score: number } | null = null;

    for (const accrual of pendingAccruals) {
      if (!accrual.vendorName) {
        continue;
      }

      const accrualAmount = Number(accrual.amount);
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
    if (dto.amount !== undefined) {
      expense.amount = this.formatMoney(dto.amount);
    }
    if (dto.vatAmount !== undefined) {
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
    if (dto.description !== undefined) {
      expense.description = dto.description;
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

    await this.expensesRepository.save(expense);

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

  async updateStatus(
    id: string,
    organizationId: string,
    dto: UpdateExpenseStatusDto,
  ): Promise<Expense> {
    const expense = await this.findById(id, organizationId);
    expense.status = dto.status;
    await this.expensesRepository.save(expense);
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

    const accrualAmount = Number(accrual.amount);
    const expenseAmount = Number(expense.amount);
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

    expense.status = ExpenseStatus.SETTLED;

    await Promise.all([
      this.expensesRepository.save(expense),
      this.accrualsRepository.save(accrual),
    ]);

    console.log(
      `Accrual ${accrual.id} ${isAutoMatched ? 'auto-' : ''}settled by expense ${expense.id}`,
    );
  }
}
