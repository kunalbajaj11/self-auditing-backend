import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BankTransaction } from '../../entities/bank-transaction.entity';
import { SystemTransaction } from '../../entities/system-transaction.entity';
import { ReconciliationRecord } from '../../entities/reconciliation-record.entity';
import { Expense } from '../../entities/expense.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { Category } from '../../entities/category.entity';
import { TransactionType } from '../../common/enums/transaction-type.enum';
import { ReconciliationStatus } from '../../common/enums/reconciliation-status.enum';
import { MatchTransactionsDto } from './dto/match-transactions.dto';
import { ManualEntryDto } from './dto/manual-entry.dto';
import {
  BankStatementParserService,
  ParsedTransaction,
} from './bank-statement-parser.service';
import { FileStorageService } from '../attachments/file-storage.service';
import { ExpensesService } from '../expenses/expenses.service';
import { CreateExpenseDto } from '../expenses/dto/create-expense.dto';
import { ExpenseType } from '../../common/enums/expense-type.enum';
import { ExpenseSource } from '../../common/enums/expense-source.enum';

const AMOUNT_TOLERANCE = 2; // AED tolerance
const DATE_TOLERANCE_DAYS = 2;
const DESCRIPTION_SIMILARITY_THRESHOLD = 0.6;

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(BankTransaction)
    private readonly bankTransactionsRepository: Repository<BankTransaction>,
    @InjectRepository(SystemTransaction)
    private readonly systemTransactionsRepository: Repository<SystemTransaction>,
    @InjectRepository(ReconciliationRecord)
    private readonly reconciliationRecordsRepository: Repository<ReconciliationRecord>,
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    private readonly parserService: BankStatementParserService,
    private readonly fileStorageService: FileStorageService,
    private readonly expensesService: ExpensesService,
    private readonly dataSource: DataSource,
  ) {}

  async uploadAndParseStatement(
    organizationId: string,
    userId: string,
    file: Express.Multer.File,
    statementPeriodStart?: string,
    statementPeriodEnd?: string,
  ): Promise<ReconciliationRecord> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Upload file to S3
    const uploadResult = await this.fileStorageService.uploadFile(
      file,
      organizationId,
      'bank-statements',
    );

    // Parse the file
    const parsedTransactions = await this.parserService.parseFile(file);

    // Determine statement period from transactions if not provided
    if (!statementPeriodStart || !statementPeriodEnd) {
      const dates = parsedTransactions.map((t) => new Date(t.transactionDate));
      statementPeriodStart =
        statementPeriodStart ||
        new Date(Math.min(...dates.map((d) => d.getTime())))
          .toISOString()
          .split('T')[0];
      statementPeriodEnd =
        statementPeriodEnd ||
        new Date(Math.max(...dates.map((d) => d.getTime())))
          .toISOString()
          .split('T')[0];
    }

    // Create reconciliation record
    const reconciliationRecord = this.reconciliationRecordsRepository.create({
      organization,
      reconciliationDate: new Date().toISOString().split('T')[0],
      statementPeriodStart,
      statementPeriodEnd,
      createdBy: user,
    });

    const savedRecord =
      await this.reconciliationRecordsRepository.save(reconciliationRecord);

    // Create bank transactions
    const bankTransactions = parsedTransactions.map((parsed) =>
      this.bankTransactionsRepository.create({
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
      }),
    );

    await this.bankTransactionsRepository.save(bankTransactions);

    // Calculate totals with validation
    // decimal(18, 2) max value: 9999999999999999.99
    const MAX_DECIMAL_VALUE = 9999999999999999.99;

    const totalCredits = bankTransactions
      .filter((t) => t.type === TransactionType.CREDIT)
      .reduce((sum, t) => {
        const amount = parseFloat(t.amount) || 0;
        // Validate individual amount
        if (isNaN(amount) || !isFinite(amount) || amount < 0) {
          console.warn(`Invalid credit amount: ${t.amount}, skipping`);
          return sum;
        }
        return sum + amount;
      }, 0);

    const totalDebits = bankTransactions
      .filter((t) => t.type === TransactionType.DEBIT)
      .reduce((sum, t) => {
        const amount = parseFloat(t.amount) || 0;
        // Validate individual amount
        if (isNaN(amount) || !isFinite(amount) || amount < 0) {
          console.warn(`Invalid debit amount: ${t.amount}, skipping`);
          return sum;
        }
        return sum + amount;
      }, 0);

    // Validate totals don't exceed database precision
    if (!isFinite(totalCredits) || !isFinite(totalDebits)) {
      throw new BadRequestException(
        `Invalid total amounts calculated. Credits: ${totalCredits}, Debits: ${totalDebits}`,
      );
    }

    if (totalCredits > MAX_DECIMAL_VALUE || totalDebits > MAX_DECIMAL_VALUE) {
      throw new BadRequestException(
        `Total amount exceeds maximum value of ${MAX_DECIMAL_VALUE.toLocaleString()}. Credits: ${totalCredits.toFixed(2)}, Debits: ${totalDebits.toFixed(2)}. Please process statements in smaller batches or contact support.`,
      );
    }

    savedRecord.totalBankCredits = totalCredits.toFixed(2);
    savedRecord.totalBankDebits = totalDebits.toFixed(2);
    savedRecord.totalUnmatched = bankTransactions.length;

    await this.reconciliationRecordsRepository.save(savedRecord);

    // Load system transactions for the period
    await this.loadSystemTransactions(
      organizationId,
      statementPeriodStart,
      statementPeriodEnd,
      savedRecord.id,
    );

    // Auto-match transactions
    await this.autoMatchTransactions(savedRecord.id);

    return this.reconciliationRecordsRepository.findOne({
      where: { id: savedRecord.id },
      relations: [
        'bankTransactions',
        'systemTransactions',
        'organization',
        'createdBy',
      ],
    }) as Promise<ReconciliationRecord>;
  }

  async loadSystemTransactions(
    organizationId: string,
    startDate: string,
    endDate: string,
    reconciliationRecordId: string,
  ): Promise<void> {
    // Get expenses in the period
    const expenses = await this.expensesRepository.find({
      where: {
        organization: { id: organizationId },
      },
      relations: ['organization'],
    });

    const systemTransactions: SystemTransaction[] = [];

    for (const expense of expenses) {
      const expenseDate = new Date(expense.expenseDate);
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (expenseDate >= start && expenseDate <= end) {
        // Create debit transaction for expense
        systemTransactions.push(
          this.systemTransactionsRepository.create({
            organization: expense.organization,
            transactionDate: expense.expenseDate,
            description: expense.description || expense.vendorName || 'Expense',
            amount: expense.totalAmount,
            type: TransactionType.DEBIT,
            expense,
            source: 'expense',
          }),
        );
      }
    }

    if (systemTransactions.length > 0) {
      const reconciliationRecord =
        await this.reconciliationRecordsRepository.findOne({
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

  async autoMatchTransactions(reconciliationRecordId: string): Promise<void> {
    const reconciliationRecord =
      await this.reconciliationRecordsRepository.findOne({
        where: { id: reconciliationRecordId },
        relations: ['bankTransactions', 'systemTransactions'],
      });

    if (!reconciliationRecord) {
      throw new NotFoundException('Reconciliation record not found');
    }

    const bankTransactions = reconciliationRecord.bankTransactions.filter(
      (t) => t.status === ReconciliationStatus.UNMATCHED,
    );
    const systemTransactions = reconciliationRecord.systemTransactions.filter(
      (t) => t.status === ReconciliationStatus.UNMATCHED,
    );

    const matches: Array<{
      bank: BankTransaction;
      system: SystemTransaction;
      score: number;
    }> = [];

    for (const bankTxn of bankTransactions) {
      for (const systemTxn of systemTransactions) {
        const score = this.calculateMatchScore(bankTxn, systemTxn);
        if (score > 0.5) {
          matches.push({ bank: bankTxn, system: systemTxn, score });
        }
      }
    }

    // Sort by score descending and match
    matches.sort((a, b) => b.score - a.score);

    const matchedBankIds = new Set<string>();
    const matchedSystemIds = new Set<string>();

    for (const match of matches) {
      if (
        !matchedBankIds.has(match.bank.id) &&
        !matchedSystemIds.has(match.system.id)
      ) {
        match.bank.status = ReconciliationStatus.MATCHED;
        match.system.status = ReconciliationStatus.MATCHED;
        match.bank.reconciliationRecord = reconciliationRecord;
        match.system.reconciliationRecord = reconciliationRecord;

        matchedBankIds.add(match.bank.id);
        matchedSystemIds.add(match.system.id);
      }
    }

    await this.bankTransactionsRepository.save(matches.map((m) => m.bank));
    await this.systemTransactionsRepository.save(matches.map((m) => m.system));

    // Update reconciliation record stats
    const matchedCount = await this.bankTransactionsRepository.count({
      where: {
        reconciliationRecord: { id: reconciliationRecordId },
        status: ReconciliationStatus.MATCHED,
      },
    });

    const unmatchedCount = await this.bankTransactionsRepository.count({
      where: {
        reconciliationRecord: { id: reconciliationRecordId },
        status: ReconciliationStatus.UNMATCHED,
      },
    });

    reconciliationRecord.totalMatched = matchedCount;
    reconciliationRecord.totalUnmatched = unmatchedCount;
    await this.reconciliationRecordsRepository.save(reconciliationRecord);
  }

  private calculateMatchScore(
    bankTxn: BankTransaction,
    systemTxn: SystemTransaction,
  ): number {
    let score = 0;

    // Amount match (40% weight)
    const amountDiff = Math.abs(
      parseFloat(bankTxn.amount) - parseFloat(systemTxn.amount),
    );
    if (amountDiff <= AMOUNT_TOLERANCE) {
      const amountScore = 1 - amountDiff / AMOUNT_TOLERANCE;
      score += amountScore * 0.4;
    }

    // Date match (30% weight)
    const bankDate = new Date(bankTxn.transactionDate);
    const systemDate = new Date(systemTxn.transactionDate);
    const dateDiffDays = Math.abs(
      (bankDate.getTime() - systemDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (dateDiffDays <= DATE_TOLERANCE_DAYS) {
      const dateScore = 1 - dateDiffDays / DATE_TOLERANCE_DAYS;
      score += dateScore * 0.3;
    }

    // Type match (10% weight)
    if (bankTxn.type === systemTxn.type) {
      score += 0.1;
    }

    // Description similarity (20% weight) - using simple keyword matching
    const similarity = this.calculateTextSimilarity(
      bankTxn.description.toLowerCase(),
      systemTxn.description.toLowerCase(),
    );
    if (similarity > DESCRIPTION_SIMILARITY_THRESHOLD) {
      score += similarity * 0.2;
    }

    return score;
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Simple word-based similarity
    const words1 = new Set(text1.split(/\s+/).filter((w) => w.length > 2));
    const words2 = new Set(text2.split(/\s+/).filter((w) => w.length > 2));

    if (words1.size === 0 && words2.size === 0) return 1;
    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  async manualMatch(
    organizationId: string,
    dto: MatchTransactionsDto,
  ): Promise<void> {
    const bankTxn = await this.bankTransactionsRepository.findOne({
      where: {
        id: dto.bankTransactionId,
        organization: { id: organizationId },
      },
    });
    if (!bankTxn) {
      throw new NotFoundException('Bank transaction not found');
    }

    const systemTxn = await this.systemTransactionsRepository.findOne({
      where: {
        id: dto.systemTransactionId,
        organization: { id: organizationId },
      },
    });
    if (!systemTxn) {
      throw new NotFoundException('System transaction not found');
    }

    bankTxn.status = ReconciliationStatus.MATCHED;
    systemTxn.status = ReconciliationStatus.MATCHED;

    await this.bankTransactionsRepository.save(bankTxn);
    await this.systemTransactionsRepository.save(systemTxn);

    // Update reconciliation record stats
    if (bankTxn.reconciliationRecord) {
      const record = await this.reconciliationRecordsRepository.findOne({
        where: { id: bankTxn.reconciliationRecord.id },
      });
      if (record) {
        const matchedCount = await this.bankTransactionsRepository.count({
          where: {
            reconciliationRecord: { id: record.id },
            status: ReconciliationStatus.MATCHED,
          },
        });
        const unmatchedCount = await this.bankTransactionsRepository.count({
          where: {
            reconciliationRecord: { id: record.id },
            status: ReconciliationStatus.UNMATCHED,
          },
        });
        record.totalMatched = matchedCount;
        record.totalUnmatched = unmatchedCount;
        await this.reconciliationRecordsRepository.save(record);
      }
    }
  }

  async createManualEntry(
    organizationId: string,
    userId: string,
    reconciliationRecordId: string,
    dto: ManualEntryDto,
  ): Promise<SystemTransaction> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const reconciliationRecord =
      await this.reconciliationRecordsRepository.findOne({
        where: { id: reconciliationRecordId },
      });
    if (!reconciliationRecord) {
      throw new NotFoundException('Reconciliation record not found');
    }

    // Create expense if type is DEBIT
    let expense: Expense | null = null;
    if (dto.type === TransactionType.DEBIT) {
      const createExpenseDto: CreateExpenseDto = {
        type: ExpenseType.EXPENSE,
        amount: dto.amount,
        vatAmount: 0,
        expenseDate: dto.transactionDate,
        description: dto.description,
        categoryId: dto.categoryId,
        source: ExpenseSource.MANUAL,
      };

      expense = await this.expensesService.create(
        organizationId,
        userId,
        createExpenseDto,
      );
    }

    // Create system transaction
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

  async getReconciliationRecords(
    organizationId: string,
    filters?: { startDate?: string; endDate?: string; status?: string },
  ): Promise<ReconciliationRecord[]> {
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

  async getReconciliationDetail(
    organizationId: string,
    recordId: string,
  ): Promise<ReconciliationRecord> {
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
      throw new NotFoundException('Reconciliation record not found');
    }

    return record;
  }
}
