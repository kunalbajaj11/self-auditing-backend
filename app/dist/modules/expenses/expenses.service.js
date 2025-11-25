"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpensesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const expense_entity_1 = require("../../entities/expense.entity");
const organization_entity_1 = require("../../entities/organization.entity");
const user_entity_1 = require("../../entities/user.entity");
const category_entity_1 = require("../../entities/category.entity");
const attachment_entity_1 = require("../../entities/attachment.entity");
const accrual_entity_1 = require("../../entities/accrual.entity");
const expense_type_enum_1 = require("../../common/enums/expense-type.enum");
const expense_status_enum_1 = require("../../common/enums/expense-status.enum");
const expense_source_enum_1 = require("../../common/enums/expense-source.enum");
const accrual_status_enum_1 = require("../../common/enums/accrual-status.enum");
const notifications_service_1 = require("../notifications/notifications.service");
const notification_type_enum_1 = require("../../common/enums/notification-type.enum");
const notification_channel_enum_1 = require("../../common/enums/notification-channel.enum");
const file_storage_service_1 = require("../attachments/file-storage.service");
const duplicate_detection_service_1 = require("../duplicates/duplicate-detection.service");
const forex_rate_service_1 = require("../forex/forex-rate.service");
const vendor_entity_1 = require("../vendors/vendor.entity");
const typeorm_3 = require("typeorm");
const common_2 = require("@nestjs/common");
const DEFAULT_ACCRUAL_TOLERANCE = Number(process.env.ACCRUAL_AMOUNT_TOLERANCE ?? 5);
let ExpensesService = class ExpensesService {
    constructor(expensesRepository, organizationsRepository, usersRepository, categoriesRepository, attachmentsRepository, accrualsRepository, vendorsRepository, notificationsService, fileStorageService, duplicateDetectionService, forexRateService) {
        this.expensesRepository = expensesRepository;
        this.organizationsRepository = organizationsRepository;
        this.usersRepository = usersRepository;
        this.categoriesRepository = categoriesRepository;
        this.attachmentsRepository = attachmentsRepository;
        this.accrualsRepository = accrualsRepository;
        this.vendorsRepository = vendorsRepository;
        this.notificationsService = notificationsService;
        this.fileStorageService = fileStorageService;
        this.duplicateDetectionService = duplicateDetectionService;
        this.forexRateService = forexRateService;
    }
    formatMoney(value) {
        return Number(value ?? 0).toFixed(2);
    }
    async findAll(organizationId, filters) {
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
    async findById(id, organizationId) {
        const expense = await this.expensesRepository.findOne({
            where: { id, organization: { id: organizationId }, isDeleted: false },
            relations: ['category', 'user', 'attachments', 'accrualDetail'],
        });
        if (!expense) {
            throw new common_1.NotFoundException('Expense not found');
        }
        return expense;
    }
    async create(organizationId, userId, dto) {
        const [organization, user] = await Promise.all([
            this.organizationsRepository.findOne({ where: { id: organizationId } }),
            this.usersRepository.findOne({ where: { id: userId } }),
        ]);
        if (!organization) {
            throw new common_1.NotFoundException('Organization not found');
        }
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        if (dto.type === expense_type_enum_1.ExpenseType.ACCRUAL &&
            !dto.expectedPaymentDate) {
            throw new common_1.BadRequestException('Accrual expenses require expected payment date');
        }
        let category = null;
        if (dto.categoryId) {
            category = await this.categoriesRepository.findOne({
                where: { id: dto.categoryId, organization: { id: organizationId } },
            });
            if (!category) {
                throw new common_1.NotFoundException('Category not found');
            }
        }
        const duplicates = await this.duplicateDetectionService.detectDuplicates(organizationId, dto.vendorName || null, dto.amount, dto.expenseDate, dto.ocrConfidence, dto.attachments);
        if (duplicates.length > 0 && this.duplicateDetectionService.shouldBlock(duplicates)) {
            throw new common_2.ConflictException({
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
        let vendor = null;
        if (dto.vendorId) {
            vendor = await this.vendorsRepository.findOne({
                where: { id: dto.vendorId, organization: { id: organizationId } },
            });
            if (!vendor) {
                throw new common_1.NotFoundException('Vendor not found');
            }
            dto.vendorName = vendor.name;
            dto.vendorTrn = vendor.vendorTrn || dto.vendorTrn;
        }
        else if (dto.vendorName) {
            vendor = await this.linkOrCreateVendor(organization, dto.vendorName, dto.vendorTrn);
        }
        const expenseCurrency = dto.currency || organization.currency || 'AED';
        const baseCurrency = organization.baseCurrency || organization.currency || 'AED';
        let exchangeRate = null;
        let baseAmount = null;
        if (expenseCurrency !== baseCurrency) {
            const expenseDate = new Date(dto.expenseDate);
            const rate = await this.forexRateService.getRate(organization, expenseCurrency, baseCurrency, expenseDate);
            exchangeRate = rate.toFixed(6);
            baseAmount = (await this.forexRateService.convert(organization, dto.amount, expenseCurrency, baseCurrency, expenseDate)).toFixed(2);
        }
        else {
            exchangeRate = '1.000000';
            baseAmount = this.formatMoney(dto.amount);
        }
        let linkedAccrualExpense = null;
        if (dto.linkedAccrualExpenseId) {
            linkedAccrualExpense = await this.expensesRepository.findOne({
                where: {
                    id: dto.linkedAccrualExpenseId,
                    organization: { id: organizationId },
                    type: expense_type_enum_1.ExpenseType.ACCRUAL,
                },
                relations: ['accrualDetail'],
            });
            if (!linkedAccrualExpense || !linkedAccrualExpense.accrualDetail) {
                throw new common_1.BadRequestException('Linked accrual expense not found or missing accrual detail');
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
            vendorName: dto.vendorName,
            vendorTrn: dto.vendorTrn,
            description: dto.description,
            status: expense_status_enum_1.ExpenseStatus.PENDING,
            source: dto.source ?? expense_source_enum_1.ExpenseSource.MANUAL,
            ocrConfidence: dto.ocrConfidence !== undefined
                ? dto.ocrConfidence.toFixed(2)
                : null,
            linkedAccrual: linkedAccrualExpense ?? null,
        });
        const saved = await this.expensesRepository.save(expense);
        if (dto.attachments?.length) {
            const attachments = dto.attachments.map((attachment) => {
                let fileKey = attachment.fileKey;
                if (!fileKey && attachment.fileUrl) {
                    fileKey = this.fileStorageService.extractFileKeyFromUrl(attachment.fileUrl);
                }
                return this.attachmentsRepository.create({
                    organization,
                    fileName: attachment.fileName,
                    fileUrl: attachment.fileUrl,
                    fileKey: fileKey || null,
                    fileType: attachment.fileType,
                    fileSize: attachment.fileSize,
                    uploadedBy: user,
                    expense: saved,
                });
            });
            await this.attachmentsRepository.save(attachments);
        }
        if (dto.type === expense_type_enum_1.ExpenseType.ACCRUAL) {
            const accrual = this.accrualsRepository.create({
                expense: saved,
                organization,
                vendorName: saved.vendorName,
                amount: saved.amount,
                expectedPaymentDate: dto.expectedPaymentDate ?? dto.expenseDate,
                status: accrual_status_enum_1.AccrualStatus.PENDING_SETTLEMENT,
            });
            await this.accrualsRepository.save(accrual);
            if (accrual.expectedPaymentDate) {
                await this.notificationsService.scheduleNotification({
                    organizationId,
                    userId,
                    title: 'Accrual Payment Reminder',
                    message: `Accrual for ${saved.vendorName ?? 'vendor'} due on ${accrual.expectedPaymentDate}`,
                    type: notification_type_enum_1.NotificationType.ACCRUAL_REMINDER,
                    channel: notification_channel_enum_1.NotificationChannel.EMAIL,
                    scheduledFor: this.notificationsService.calculateReminderDate(accrual.expectedPaymentDate),
                });
            }
        }
        if (linkedAccrualExpense) {
            await this.linkExpenseToAccrual(saved, linkedAccrualExpense);
        }
        else if (dto.type !== expense_type_enum_1.ExpenseType.ACCRUAL &&
            (dto.type === expense_type_enum_1.ExpenseType.EXPENSE || dto.type === expense_type_enum_1.ExpenseType.CREDIT) &&
            dto.vendorName &&
            dto.amount) {
            await this.autoMatchAccrual(saved, organizationId);
        }
        if (vendor) {
            vendor.lastUsedAt = new Date();
            await this.vendorsRepository.save(vendor);
        }
        return this.findById(saved.id, organizationId);
    }
    async checkDuplicates(organizationId, dto) {
        const duplicates = await this.duplicateDetectionService.detectDuplicates(organizationId, dto.vendorName || null, dto.amount, dto.expenseDate, dto.ocrConfidence, dto.attachments);
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
    async linkOrCreateVendor(organization, vendorName, vendorTrn) {
        if (!vendorName) {
            return null;
        }
        const existingVendors = await this.vendorsRepository.find({
            where: {
                organization: { id: organization.id },
                isActive: true,
            },
        });
        const matchedVendor = existingVendors.find((v) => {
            const v1 = v.name.toLowerCase().trim();
            const v2 = vendorName.toLowerCase().trim();
            return (v1 === v2 ||
                v1.includes(v2) ||
                v2.includes(v1) ||
                this.levenshteinDistance(v1, v2) / Math.max(v1.length, v2.length) < 0.15);
        });
        if (matchedVendor) {
            return matchedVendor;
        }
        const vendor = this.vendorsRepository.create({
            organization,
            name: vendorName,
            vendorTrn: vendorTrn || null,
            preferredCurrency: organization.currency || 'AED',
            firstUsedAt: new Date(),
            lastUsedAt: new Date(),
            isActive: true,
        });
        return this.vendorsRepository.save(vendor);
    }
    levenshteinDistance(str1, str2) {
        const matrix = [];
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
                }
                else {
                    matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
                }
            }
        }
        return matrix[str2.length][str1.length];
    }
    async autoMatchAccrual(expense, organizationId) {
        if (!expense.vendorName || !expense.amount) {
            return;
        }
        const pendingAccruals = await this.accrualsRepository.find({
            where: {
                organization: { id: organizationId },
                status: accrual_status_enum_1.AccrualStatus.PENDING_SETTLEMENT,
            },
            relations: ['expense'],
            order: {
                expectedPaymentDate: 'ASC',
            },
        });
        if (pendingAccruals.length === 0) {
            return;
        }
        const expenseAmount = Number(expense.amount);
        const expenseVendor = expense.vendorName.toLowerCase().trim();
        const expenseDate = new Date(expense.expenseDate);
        let bestMatch = null;
        for (const accrual of pendingAccruals) {
            if (!accrual.vendorName) {
                continue;
            }
            const accrualAmount = Number(accrual.amount);
            const accrualVendor = accrual.vendorName.toLowerCase().trim();
            const accrualExpectedDate = new Date(accrual.expectedPaymentDate);
            const vendorMatch = this.matchVendorNames(expenseVendor, accrualVendor);
            if (!vendorMatch) {
                continue;
            }
            const amountDiff = Math.abs(accrualAmount - expenseAmount);
            const tolerance = DEFAULT_ACCRUAL_TOLERANCE;
            if (amountDiff > tolerance) {
                continue;
            }
            const amountScore = (amountDiff / tolerance) * 5;
            const daysDiff = Math.abs((expenseDate.getTime() - accrualExpectedDate.getTime()) /
                (1000 * 60 * 60 * 24));
            const dateScore = Math.min(daysDiff / 30, 1) * 10;
            const vendorScore = expenseVendor === accrualVendor ? 0 : 2;
            const totalScore = amountScore + dateScore + vendorScore;
            if (!bestMatch || totalScore < bestMatch.score) {
                bestMatch = { accrual, score: totalScore };
            }
        }
        if (bestMatch && bestMatch.score < 10) {
            console.log(`Auto-matching expense ${expense.id} to accrual ${bestMatch.accrual.id} (score: ${bestMatch.score.toFixed(2)})`);
            await this.linkExpenseToAccrual(expense, bestMatch.accrual.expense, true);
        }
    }
    matchVendorNames(vendor1, vendor2) {
        if (vendor1 === vendor2) {
            return true;
        }
        if (vendor1.includes(vendor2) || vendor2.includes(vendor1)) {
            return true;
        }
        const normalize = (name) => {
            return name
                .replace(/\b(llc|inc|corp|limited|ltd|company|co)\b/gi, '')
                .replace(/[^\w\s]/g, '')
                .trim();
        };
        const normalized1 = normalize(vendor1);
        const normalized2 = normalize(vendor2);
        if (normalized1 && normalized2) {
            if (normalized1 === normalized2) {
                return true;
            }
            if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
                return true;
            }
        }
        return false;
    }
    async update(id, organizationId, dto) {
        const expense = await this.findById(id, organizationId);
        if (dto.categoryId) {
            const category = await this.categoriesRepository.findOne({
                where: { id: dto.categoryId, organization: { id: organizationId } },
            });
            if (!category) {
                throw new common_1.NotFoundException('Category not found');
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
            expense.attachments = dto.attachments.map((attachment) => this.attachmentsRepository.create({
                ...attachment,
                organization: expense.organization,
                uploadedBy: expense.user,
                expense,
            }));
        }
        await this.expensesRepository.save(expense);
        if ((dto.vendorName !== undefined || dto.amount !== undefined) &&
            expense.type !== expense_type_enum_1.ExpenseType.ACCRUAL &&
            (expense.type === expense_type_enum_1.ExpenseType.EXPENSE || expense.type === expense_type_enum_1.ExpenseType.CREDIT) &&
            expense.vendorName &&
            expense.amount &&
            !expense.linkedAccrual) {
            await this.autoMatchAccrual(expense, organizationId);
        }
        return this.findById(id, organizationId);
    }
    async updateStatus(id, organizationId, dto) {
        const expense = await this.findById(id, organizationId);
        expense.status = dto.status;
        await this.expensesRepository.save(expense);
        return this.findById(id, organizationId);
    }
    async linkAccrual(id, organizationId, dto) {
        const expense = await this.findById(id, organizationId);
        const accrualExpense = await this.expensesRepository.findOne({
            where: {
                id: dto.accrualExpenseId,
                organization: { id: organizationId },
                type: expense_type_enum_1.ExpenseType.ACCRUAL,
            },
            relations: ['accrualDetail'],
        });
        if (!accrualExpense || !accrualExpense.accrualDetail) {
            throw new common_1.BadRequestException('Accrual not found');
        }
        await this.linkExpenseToAccrual(expense, accrualExpense);
        return this.findById(id, organizationId);
    }
    async linkExpenseToAccrual(expense, accrualExpense, isAutoMatched = false) {
        const accrual = await this.accrualsRepository.findOne({
            where: { expense: { id: accrualExpense.id } },
            relations: ['expense'],
        });
        if (!accrual) {
            throw new common_1.BadRequestException('Accrual detail not found');
        }
        if (accrual.status !== accrual_status_enum_1.AccrualStatus.PENDING_SETTLEMENT) {
            throw new common_1.BadRequestException('Accrual is already settled');
        }
        const accrualAmount = Number(accrual.amount);
        const expenseAmount = Number(expense.amount);
        if (Math.abs(accrualAmount - expenseAmount) >
            DEFAULT_ACCRUAL_TOLERANCE) {
            throw new common_1.BadRequestException(`Settlement amount differs by more than ${DEFAULT_ACCRUAL_TOLERANCE}`);
        }
        expense.linkedAccrual = accrualExpense;
        accrual.settlementExpense = expense;
        accrual.settlementDate = expense.expenseDate;
        accrual.status = isAutoMatched
            ? accrual_status_enum_1.AccrualStatus.AUTO_SETTLED
            : accrual_status_enum_1.AccrualStatus.SETTLED;
        expense.status = expense_status_enum_1.ExpenseStatus.SETTLED;
        await Promise.all([
            this.expensesRepository.save(expense),
            this.accrualsRepository.save(accrual),
        ]);
        console.log(`Accrual ${accrual.id} ${isAutoMatched ? 'auto-' : ''}settled by expense ${expense.id}`);
    }
};
exports.ExpensesService = ExpensesService;
exports.ExpensesService = ExpensesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(expense_entity_1.Expense)),
    __param(1, (0, typeorm_1.InjectRepository)(organization_entity_1.Organization)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(3, (0, typeorm_1.InjectRepository)(category_entity_1.Category)),
    __param(4, (0, typeorm_1.InjectRepository)(attachment_entity_1.Attachment)),
    __param(5, (0, typeorm_1.InjectRepository)(accrual_entity_1.Accrual)),
    __param(6, (0, typeorm_1.InjectRepository)(vendor_entity_1.Vendor)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_3.Repository,
        notifications_service_1.NotificationsService,
        file_storage_service_1.FileStorageService,
        duplicate_detection_service_1.DuplicateDetectionService,
        forex_rate_service_1.ForexRateService])
], ExpensesService);
//# sourceMappingURL=expenses.service.js.map