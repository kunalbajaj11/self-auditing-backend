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
exports.ReconciliationService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const bank_transaction_entity_1 = require("../../entities/bank-transaction.entity");
const system_transaction_entity_1 = require("../../entities/system-transaction.entity");
const reconciliation_record_entity_1 = require("../../entities/reconciliation-record.entity");
const expense_entity_1 = require("../../entities/expense.entity");
const organization_entity_1 = require("../../entities/organization.entity");
const user_entity_1 = require("../../entities/user.entity");
const category_entity_1 = require("../../entities/category.entity");
const transaction_type_enum_1 = require("../../common/enums/transaction-type.enum");
const reconciliation_status_enum_1 = require("../../common/enums/reconciliation-status.enum");
const bank_statement_parser_service_1 = require("./bank-statement-parser.service");
const file_storage_service_1 = require("../attachments/file-storage.service");
const expenses_service_1 = require("../expenses/expenses.service");
const expense_type_enum_1 = require("../../common/enums/expense-type.enum");
const expense_source_enum_1 = require("../../common/enums/expense-source.enum");
const AMOUNT_TOLERANCE = 2;
const DATE_TOLERANCE_DAYS = 2;
const DESCRIPTION_SIMILARITY_THRESHOLD = 0.6;
let ReconciliationService = class ReconciliationService {
    constructor(bankTransactionsRepository, systemTransactionsRepository, reconciliationRecordsRepository, expensesRepository, organizationsRepository, usersRepository, categoriesRepository, parserService, fileStorageService, expensesService, dataSource) {
        this.bankTransactionsRepository = bankTransactionsRepository;
        this.systemTransactionsRepository = systemTransactionsRepository;
        this.reconciliationRecordsRepository = reconciliationRecordsRepository;
        this.expensesRepository = expensesRepository;
        this.organizationsRepository = organizationsRepository;
        this.usersRepository = usersRepository;
        this.categoriesRepository = categoriesRepository;
        this.parserService = parserService;
        this.fileStorageService = fileStorageService;
        this.expensesService = expensesService;
        this.dataSource = dataSource;
    }
    async uploadAndParseStatement(organizationId, userId, file, statementPeriodStart, statementPeriodEnd) {
        const organization = await this.organizationsRepository.findOne({
            where: { id: organizationId },
        });
        if (!organization) {
            throw new common_1.NotFoundException('Organization not found');
        }
        const user = await this.usersRepository.findOne({
            where: { id: userId },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        const uploadResult = await this.fileStorageService.uploadFile(file, organizationId, 'bank-statements');
        const parsedTransactions = await this.parserService.parseFile(file);
        if (!statementPeriodStart || !statementPeriodEnd) {
            const dates = parsedTransactions.map((t) => new Date(t.transactionDate));
            statementPeriodStart = statementPeriodStart || new Date(Math.min(...dates.map(d => d.getTime()))).toISOString().split('T')[0];
            statementPeriodEnd = statementPeriodEnd || new Date(Math.max(...dates.map(d => d.getTime()))).toISOString().split('T')[0];
        }
        const reconciliationRecord = this.reconciliationRecordsRepository.create({
            organization,
            reconciliationDate: new Date().toISOString().split('T')[0],
            statementPeriodStart,
            statementPeriodEnd,
            createdBy: user,
        });
        const savedRecord = await this.reconciliationRecordsRepository.save(reconciliationRecord);
        const bankTransactions = parsedTransactions.map((parsed) => this.bankTransactionsRepository.create({
            organization,
            transactionDate: parsed.transactionDate,
            description: parsed.description,
            amount: parsed.amount,
            type: parsed.type,
            balance: parsed.balance,
            reference: parsed.reference,
            sourceFile: uploadResult.fileUrl,
            reconciliationRecord: savedRecord,
            uploadedBy: user,
        }));
        await this.bankTransactionsRepository.save(bankTransactions);
        const MAX_DECIMAL_VALUE = 9999999999999999.99;
        const totalCredits = bankTransactions
            .filter((t) => t.type === transaction_type_enum_1.TransactionType.CREDIT)
            .reduce((sum, t) => {
            const amount = parseFloat(t.amount) || 0;
            if (isNaN(amount) || !isFinite(amount) || amount < 0) {
                console.warn(`Invalid credit amount: ${t.amount}, skipping`);
                return sum;
            }
            return sum + amount;
        }, 0);
        const totalDebits = bankTransactions
            .filter((t) => t.type === transaction_type_enum_1.TransactionType.DEBIT)
            .reduce((sum, t) => {
            const amount = parseFloat(t.amount) || 0;
            if (isNaN(amount) || !isFinite(amount) || amount < 0) {
                console.warn(`Invalid debit amount: ${t.amount}, skipping`);
                return sum;
            }
            return sum + amount;
        }, 0);
        if (!isFinite(totalCredits) || !isFinite(totalDebits)) {
            throw new common_1.BadRequestException(`Invalid total amounts calculated. Credits: ${totalCredits}, Debits: ${totalDebits}`);
        }
        if (totalCredits > MAX_DECIMAL_VALUE || totalDebits > MAX_DECIMAL_VALUE) {
            throw new common_1.BadRequestException(`Total amount exceeds maximum value of ${MAX_DECIMAL_VALUE.toLocaleString()}. Credits: ${totalCredits.toFixed(2)}, Debits: ${totalDebits.toFixed(2)}. Please process statements in smaller batches or contact support.`);
        }
        savedRecord.totalBankCredits = totalCredits.toFixed(2);
        savedRecord.totalBankDebits = totalDebits.toFixed(2);
        savedRecord.totalUnmatched = bankTransactions.length;
        await this.reconciliationRecordsRepository.save(savedRecord);
        await this.loadSystemTransactions(organizationId, statementPeriodStart, statementPeriodEnd, savedRecord.id);
        await this.autoMatchTransactions(savedRecord.id);
        return this.reconciliationRecordsRepository.findOne({
            where: { id: savedRecord.id },
            relations: ['bankTransactions', 'systemTransactions', 'organization', 'createdBy'],
        });
    }
    async loadSystemTransactions(organizationId, startDate, endDate, reconciliationRecordId) {
        const expenses = await this.expensesRepository.find({
            where: {
                organization: { id: organizationId },
            },
            relations: ['organization'],
        });
        const systemTransactions = [];
        for (const expense of expenses) {
            const expenseDate = new Date(expense.expenseDate);
            const start = new Date(startDate);
            const end = new Date(endDate);
            if (expenseDate >= start && expenseDate <= end) {
                systemTransactions.push(this.systemTransactionsRepository.create({
                    organization: expense.organization,
                    transactionDate: expense.expenseDate,
                    description: expense.description || expense.vendorName || 'Expense',
                    amount: expense.totalAmount,
                    type: transaction_type_enum_1.TransactionType.DEBIT,
                    expense,
                    source: 'expense',
                }));
            }
        }
        if (systemTransactions.length > 0) {
            const reconciliationRecord = await this.reconciliationRecordsRepository.findOne({
                where: { id: reconciliationRecordId },
            });
            if (reconciliationRecord) {
                systemTransactions.forEach((t) => {
                    t.reconciliationRecord = reconciliationRecord;
                });
                await this.systemTransactionsRepository.save(systemTransactions);
            }
        }
    }
    async autoMatchTransactions(reconciliationRecordId) {
        const reconciliationRecord = await this.reconciliationRecordsRepository.findOne({
            where: { id: reconciliationRecordId },
            relations: ['bankTransactions', 'systemTransactions'],
        });
        if (!reconciliationRecord) {
            throw new common_1.NotFoundException('Reconciliation record not found');
        }
        const bankTransactions = reconciliationRecord.bankTransactions.filter((t) => t.status === reconciliation_status_enum_1.ReconciliationStatus.UNMATCHED);
        const systemTransactions = reconciliationRecord.systemTransactions.filter((t) => t.status === reconciliation_status_enum_1.ReconciliationStatus.UNMATCHED);
        const matches = [];
        for (const bankTxn of bankTransactions) {
            for (const systemTxn of systemTransactions) {
                const score = this.calculateMatchScore(bankTxn, systemTxn);
                if (score > 0.5) {
                    matches.push({ bank: bankTxn, system: systemTxn, score });
                }
            }
        }
        matches.sort((a, b) => b.score - a.score);
        const matchedBankIds = new Set();
        const matchedSystemIds = new Set();
        for (const match of matches) {
            if (!matchedBankIds.has(match.bank.id) && !matchedSystemIds.has(match.system.id)) {
                match.bank.status = reconciliation_status_enum_1.ReconciliationStatus.MATCHED;
                match.system.status = reconciliation_status_enum_1.ReconciliationStatus.MATCHED;
                match.bank.reconciliationRecord = reconciliationRecord;
                match.system.reconciliationRecord = reconciliationRecord;
                matchedBankIds.add(match.bank.id);
                matchedSystemIds.add(match.system.id);
            }
        }
        await this.bankTransactionsRepository.save(matches.map((m) => m.bank));
        await this.systemTransactionsRepository.save(matches.map((m) => m.system));
        const matchedCount = await this.bankTransactionsRepository.count({
            where: {
                reconciliationRecord: { id: reconciliationRecordId },
                status: reconciliation_status_enum_1.ReconciliationStatus.MATCHED,
            },
        });
        const unmatchedCount = await this.bankTransactionsRepository.count({
            where: {
                reconciliationRecord: { id: reconciliationRecordId },
                status: reconciliation_status_enum_1.ReconciliationStatus.UNMATCHED,
            },
        });
        reconciliationRecord.totalMatched = matchedCount;
        reconciliationRecord.totalUnmatched = unmatchedCount;
        await this.reconciliationRecordsRepository.save(reconciliationRecord);
    }
    calculateMatchScore(bankTxn, systemTxn) {
        let score = 0;
        const amountDiff = Math.abs(parseFloat(bankTxn.amount) - parseFloat(systemTxn.amount));
        if (amountDiff <= AMOUNT_TOLERANCE) {
            const amountScore = 1 - amountDiff / AMOUNT_TOLERANCE;
            score += amountScore * 0.4;
        }
        const bankDate = new Date(bankTxn.transactionDate);
        const systemDate = new Date(systemTxn.transactionDate);
        const dateDiffDays = Math.abs((bankDate.getTime() - systemDate.getTime()) / (1000 * 60 * 60 * 24));
        if (dateDiffDays <= DATE_TOLERANCE_DAYS) {
            const dateScore = 1 - dateDiffDays / DATE_TOLERANCE_DAYS;
            score += dateScore * 0.3;
        }
        if (bankTxn.type === systemTxn.type) {
            score += 0.1;
        }
        const similarity = this.calculateTextSimilarity(bankTxn.description.toLowerCase(), systemTxn.description.toLowerCase());
        if (similarity > DESCRIPTION_SIMILARITY_THRESHOLD) {
            score += similarity * 0.2;
        }
        return score;
    }
    calculateTextSimilarity(text1, text2) {
        const words1 = new Set(text1.split(/\s+/).filter((w) => w.length > 2));
        const words2 = new Set(text2.split(/\s+/).filter((w) => w.length > 2));
        if (words1.size === 0 && words2.size === 0)
            return 1;
        if (words1.size === 0 || words2.size === 0)
            return 0;
        const intersection = new Set([...words1].filter((w) => words2.has(w)));
        const union = new Set([...words1, ...words2]);
        return intersection.size / union.size;
    }
    async manualMatch(organizationId, dto) {
        const bankTxn = await this.bankTransactionsRepository.findOne({
            where: { id: dto.bankTransactionId, organization: { id: organizationId } },
        });
        if (!bankTxn) {
            throw new common_1.NotFoundException('Bank transaction not found');
        }
        const systemTxn = await this.systemTransactionsRepository.findOne({
            where: { id: dto.systemTransactionId, organization: { id: organizationId } },
        });
        if (!systemTxn) {
            throw new common_1.NotFoundException('System transaction not found');
        }
        bankTxn.status = reconciliation_status_enum_1.ReconciliationStatus.MATCHED;
        systemTxn.status = reconciliation_status_enum_1.ReconciliationStatus.MATCHED;
        await this.bankTransactionsRepository.save(bankTxn);
        await this.systemTransactionsRepository.save(systemTxn);
        if (bankTxn.reconciliationRecord) {
            const record = await this.reconciliationRecordsRepository.findOne({
                where: { id: bankTxn.reconciliationRecord.id },
            });
            if (record) {
                const matchedCount = await this.bankTransactionsRepository.count({
                    where: {
                        reconciliationRecord: { id: record.id },
                        status: reconciliation_status_enum_1.ReconciliationStatus.MATCHED,
                    },
                });
                const unmatchedCount = await this.bankTransactionsRepository.count({
                    where: {
                        reconciliationRecord: { id: record.id },
                        status: reconciliation_status_enum_1.ReconciliationStatus.UNMATCHED,
                    },
                });
                record.totalMatched = matchedCount;
                record.totalUnmatched = unmatchedCount;
                await this.reconciliationRecordsRepository.save(record);
            }
        }
    }
    async createManualEntry(organizationId, userId, reconciliationRecordId, dto) {
        const organization = await this.organizationsRepository.findOne({
            where: { id: organizationId },
        });
        if (!organization) {
            throw new common_1.NotFoundException('Organization not found');
        }
        const reconciliationRecord = await this.reconciliationRecordsRepository.findOne({
            where: { id: reconciliationRecordId },
        });
        if (!reconciliationRecord) {
            throw new common_1.NotFoundException('Reconciliation record not found');
        }
        let expense = null;
        if (dto.type === transaction_type_enum_1.TransactionType.DEBIT) {
            const createExpenseDto = {
                type: expense_type_enum_1.ExpenseType.EXPENSE,
                amount: dto.amount,
                vatAmount: 0,
                expenseDate: dto.transactionDate,
                description: dto.description,
                categoryId: dto.categoryId,
                source: expense_source_enum_1.ExpenseSource.MANUAL,
            };
            expense = await this.expensesService.create(organizationId, userId, createExpenseDto);
        }
        const systemTxn = this.systemTransactionsRepository.create({
            organization,
            transactionDate: dto.transactionDate,
            description: dto.description,
            amount: dto.amount.toFixed(2),
            type: dto.type,
            expense: expense || undefined,
            reconciliationRecord,
            source: 'reconciliation',
        });
        return this.systemTransactionsRepository.save(systemTxn);
    }
    async getReconciliationRecords(organizationId, filters) {
        const query = this.reconciliationRecordsRepository
            .createQueryBuilder('record')
            .leftJoinAndSelect('record.organization', 'organization')
            .leftJoinAndSelect('record.createdBy', 'createdBy')
            .where('record.organization_id = :organizationId', { organizationId });
        if (filters?.startDate) {
            query.andWhere('record.reconciliation_date >= :startDate', {
                startDate: filters.startDate,
            });
        }
        if (filters?.endDate) {
            query.andWhere('record.reconciliation_date <= :endDate', {
                endDate: filters.endDate,
            });
        }
        query.orderBy('record.reconciliation_date', 'DESC');
        return query.getMany();
    }
    async getReconciliationDetail(organizationId, recordId) {
        const record = await this.reconciliationRecordsRepository.findOne({
            where: { id: recordId, organization: { id: organizationId } },
            relations: [
                'bankTransactions',
                'systemTransactions',
                'systemTransactions.expense',
                'organization',
                'createdBy',
            ],
        });
        if (!record) {
            throw new common_1.NotFoundException('Reconciliation record not found');
        }
        return record;
    }
};
exports.ReconciliationService = ReconciliationService;
exports.ReconciliationService = ReconciliationService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(bank_transaction_entity_1.BankTransaction)),
    __param(1, (0, typeorm_1.InjectRepository)(system_transaction_entity_1.SystemTransaction)),
    __param(2, (0, typeorm_1.InjectRepository)(reconciliation_record_entity_1.ReconciliationRecord)),
    __param(3, (0, typeorm_1.InjectRepository)(expense_entity_1.Expense)),
    __param(4, (0, typeorm_1.InjectRepository)(organization_entity_1.Organization)),
    __param(5, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(6, (0, typeorm_1.InjectRepository)(category_entity_1.Category)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        bank_statement_parser_service_1.BankStatementParserService,
        file_storage_service_1.FileStorageService,
        expenses_service_1.ExpensesService,
        typeorm_2.DataSource])
], ReconciliationService);
//# sourceMappingURL=reconciliation.service.js.map