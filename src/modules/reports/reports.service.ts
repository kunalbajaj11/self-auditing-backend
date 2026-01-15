import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from '../../entities/expense.entity';
import { Accrual } from '../../entities/accrual.entity';
import { Report } from '../../entities/report.entity';
import { Organization } from '../../entities/organization.entity';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { ExpensePayment } from '../../entities/expense-payment.entity';
import { InvoicePayment } from '../../entities/invoice-payment.entity';
import { JournalEntry } from '../../entities/journal-entry.entity';
import { CreditNote } from '../../entities/credit-note.entity';
import { DebitNote } from '../../entities/debit-note.entity';
import { CreditNoteApplication } from '../../entities/credit-note-application.entity';
import { DebitNoteApplication } from '../../entities/debit-note-application.entity';
import { DebitNoteExpenseApplication } from '../../entities/debit-note-expense-application.entity';
import { GenerateReportDto } from './dto/generate-report.dto';
import { ReportHistoryFilterDto } from './dto/report-history-filter.dto';
import { ReportType } from '../../common/enums/report-type.enum';
import { AccrualStatus } from '../../common/enums/accrual-status.enum';
import { PaymentStatus } from '../../common/enums/payment-status.enum';
import { CreditNoteStatus } from '../../common/enums/credit-note-status.enum';
import { DebitNoteStatus } from '../../common/enums/debit-note-status.enum';
import { SettingsService } from '../settings/settings.service';
import {
  JournalEntryAccount,
  ACCOUNT_METADATA,
} from '../../common/enums/journal-entry-account.enum';
import { Product } from '../products/product.entity';
import { StockMovement } from '../inventory/entities/stock-movement.entity';
import { StockMovementType } from '../../common/enums/stock-movement-type.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
    @InjectRepository(Accrual)
    private readonly accrualsRepository: Repository<Accrual>,
    @InjectRepository(Report)
    private readonly reportsRepository: Repository<Report>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(SalesInvoice)
    private readonly salesInvoicesRepository: Repository<SalesInvoice>,
    @InjectRepository(ExpensePayment)
    private readonly expensePaymentsRepository: Repository<ExpensePayment>,
    @InjectRepository(InvoicePayment)
    private readonly invoicePaymentsRepository: Repository<InvoicePayment>,
    @InjectRepository(JournalEntry)
    private readonly journalEntriesRepository: Repository<JournalEntry>,
    @InjectRepository(CreditNote)
    private readonly creditNotesRepository: Repository<CreditNote>,
    @InjectRepository(DebitNote)
    private readonly debitNotesRepository: Repository<DebitNote>,
    @InjectRepository(CreditNoteApplication)
    private readonly creditNoteApplicationsRepository: Repository<CreditNoteApplication>,
    @InjectRepository(DebitNoteApplication)
    private readonly debitNoteApplicationsRepository: Repository<DebitNoteApplication>,
    @InjectRepository(DebitNoteExpenseApplication)
    private readonly debitNoteExpenseApplicationsRepository: Repository<DebitNoteExpenseApplication>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(StockMovement)
    private readonly stockMovementsRepository: Repository<StockMovement>,
    private readonly settingsService: SettingsService,
  ) {}

  async listHistory(
    organizationId: string,
    filters: ReportHistoryFilterDto,
  ): Promise<Report[]> {
    this.logger.log(
      `Listing report history: organizationId=${organizationId}, filters=${JSON.stringify(filters)}`,
    );
    try {
      const query = this.reportsRepository
        .createQueryBuilder('report')
        .where('report.organization_id = :organizationId', { organizationId });
      if (filters.type) {
        query.andWhere('report.type = :type', { type: filters.type });
      }
      query.orderBy('report.created_at', 'DESC');
      const results = await query.getMany();
      this.logger.debug(
        `Report history retrieved: count=${results.length}, organizationId=${organizationId}`,
      );
      return results;
    } catch (error) {
      this.logger.error(
        `Error listing report history: organizationId=${organizationId}, error=${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findById(id: string, organizationId: string): Promise<Report | null> {
    this.logger.debug(
      `Finding report by ID: id=${id}, organizationId=${organizationId}`,
    );
    try {
      const report = await this.reportsRepository.findOne({
        where: {
          id,
          organization: { id: organizationId },
        },
      });
      this.logger.debug(
        `Report found: id=${id}, found=${!!report}, organizationId=${organizationId}`,
      );
      return report;
    } catch (error) {
      this.logger.error(
        `Error finding report: id=${id}, organizationId=${organizationId}, error=${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getFilterOptions(organizationId: string): Promise<{
    vendors: string[];
    customers: string[];
    categories: string[];
  }> {
    this.logger.log(`Getting filter options: organizationId=${organizationId}`);
    try {
      const vendorResults = await this.expensesRepository
        .createQueryBuilder('expense')
        .select('expense.vendor_name', 'vendorName')
        .distinct(true)
        .where('expense.organization_id = :organizationId', { organizationId })
        .andWhere('expense.is_deleted = false')
        .andWhere('expense.vendor_name IS NOT NULL')
        .andWhere("expense.vendor_name != ''")
        .getRawMany();

      const customerResults = await this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .leftJoin('invoice.customer', 'customer')
        .select(
          'COALESCE(customer.name, invoice.customer_name)',
          'customerName',
        )
        .distinct(true)
        .where('invoice.organization_id = :organizationId', { organizationId })
        .andWhere('COALESCE(customer.name, invoice.customer_name) IS NOT NULL')
        .andWhere("COALESCE(customer.name, invoice.customer_name) != ''")
        .getRawMany();

      const vendors = vendorResults
        .map((r) => r.vendorname || r.vendorName || r.vendor_name)
        .filter((v) => v)
        .sort();

      const customers = customerResults
        .map((r) => r.customername || r.customerName || r.customer_name)
        .filter((c) => c)
        .sort();

      this.logger.debug(
        `Filter options retrieved: vendors=${vendors.length}, customers=${customers.length}, organizationId=${organizationId}`,
      );

      return {
        vendors,
        customers,
        categories: [],
      };
    } catch (error) {
      this.logger.error(
        `Error getting filter options: organizationId=${organizationId}, error=${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async generate(
    organizationId: string,
    userId: string,
    dto: GenerateReportDto,
  ): Promise<{
    type: ReportType;
    generatedAt: Date;
    data: any;
    summary?: any;
  }> {
    this.logger.log(
      `Generating report: type=${dto.type}, organizationId=${organizationId}, userId=${userId}, filters=${JSON.stringify(dto.filters)}`,
    );

    let data: any = null;
    let summary: any = null;

    try {
      switch (dto.type) {
        case ReportType.TRIAL_BALANCE:
          data = await this.buildTrialBalance(organizationId, dto.filters);
          break;
        case ReportType.BALANCE_SHEET:
          data = await this.buildBalanceSheet(organizationId, dto.filters);
          break;
        case ReportType.PROFIT_AND_LOSS:
          data = await this.buildProfitAndLoss(organizationId, dto.filters);
          break;
        case ReportType.PAYABLES:
          data = await this.buildPayables(organizationId, dto.filters);
          break;
        case ReportType.RECEIVABLES:
          data = await this.buildReceivables(organizationId, dto.filters);
          break;
        case ReportType.VAT_CONTROL_ACCOUNT:
          data = await this.buildVatControlAccount(organizationId, dto.filters);
          break;
        case ReportType.STOCK_BALANCE:
          data = await this.buildStockBalanceReport(
            organizationId,
            dto.filters,
          );
          break;
        default:
          this.logger.warn(`Unknown report type: ${dto.type}`);
          data = {};
      }

      this.logger.debug(
        `Report data generated: type=${dto.type}, hasData=${!!data}, dataKeys=${data ? Object.keys(data).join(',') : 'none'}`,
      );

      if (data && typeof data === 'object' && 'summary' in data) {
        summary = data.summary;
        this.logger.debug(`Summary extracted: ${JSON.stringify(summary)}`);
      }

      const record = this.reportsRepository.create({
        organization: { id: organizationId } as any,
        type: dto.type,
        filters: dto.filters ?? {},
        generatedBy: { id: userId } as any,
      });
      await this.reportsRepository.save(record);
      this.logger.debug(`Report record saved: id=${record.id}`);

      this.logger.log(
        `Report generated successfully: type=${dto.type}, organizationId=${organizationId}`,
      );
      return { type: dto.type, generatedAt: new Date(), data, summary };
    } catch (error) {
      this.logger.error(
        `Error generating report: type=${dto.type}, organizationId=${organizationId}, error=${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async buildTrialBalance(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    this.logger.log(
      `Building Trial Balance: organizationId=${organizationId}, filters=${JSON.stringify(filters)}`,
    );
    try {
      let startDate = filters?.['startDate'];
      let endDate = filters?.['endDate'];

      if (!startDate || !endDate) {
        this.logger.debug(
          `No date filters provided, calculating from tax settings: organizationId=${organizationId}`,
        );
        const taxSettings =
          await this.settingsService.getTaxSettings(organizationId);
        const taxYearEnd = taxSettings.taxYearEnd;

        if (taxYearEnd) {
          const [month, day] = taxYearEnd.split('-').map(Number);
          const now = new Date();
          const currentYear = now.getFullYear();
          const fiscalYearEnd = new Date(currentYear, month - 1, day);

          if (now > fiscalYearEnd) {
            const lastYearEnd = new Date(currentYear - 1, month - 1, day);
            const startDateObj = new Date(lastYearEnd);
            startDateObj.setDate(startDateObj.getDate() + 1);
            startDate = startDateObj.toISOString().split('T')[0];
            endDate = fiscalYearEnd.toISOString().split('T')[0];
          } else {
            const yearBeforeLastEnd = new Date(currentYear - 2, month - 1, day);
            const startDateObj = new Date(yearBeforeLastEnd);
            startDateObj.setDate(startDateObj.getDate() + 1);
            startDate = startDateObj.toISOString().split('T')[0];
            endDate = new Date(currentYear - 1, month - 1, day)
              .toISOString()
              .split('T')[0];
          }
        } else {
          this.logger.debug(
            `No tax year end configured, using calendar year: organizationId=${organizationId}`,
          );
          startDate = new Date(new Date().getFullYear(), 0, 1)
            .toISOString()
            .split('T')[0];
          endDate = new Date().toISOString().split('T')[0];
        }
      }

      this.logger.debug(
        `Trial Balance date range: startDate=${startDate}, endDate=${endDate}, organizationId=${organizationId}`,
      );

      const accounts: Array<{
        accountName: string;
        accountType: string;
        debit: number;
        credit: number;
        balance: number;
      }> = [];

      const expenseQuery = this.expensesRepository
        .createQueryBuilder('expense')
        .leftJoin('expense.category', 'category')
        .select([
          "COALESCE(category.name, 'Uncategorized Expenses') AS accountName",
          "'Expense' AS accountType",
          'SUM(COALESCE(expense.base_amount, expense.amount)) AS debit',
          '0 AS credit',
        ])
        .where('expense.organization_id = :organizationId', { organizationId })
        .andWhere('expense.is_deleted = false')
        .andWhere('expense.expense_date >= :startDate', { startDate })
        .andWhere('expense.expense_date <= :endDate', { endDate })
        .andWhere("(expense.type IS NULL OR expense.type != 'credit')")
        .groupBy('category.name');

      if (filters?.['type']) {
        const types = Array.isArray(filters.type)
          ? filters.type
          : [filters.type];
        expenseQuery.andWhere('expense.type IN (:...types)', { types });
      }

      const expenseRows = await expenseQuery.getRawMany();
      this.logger.debug(
        `Expense rows retrieved: count=${expenseRows.length}, organizationId=${organizationId}`,
      );

      // Get supplier debit notes (those linked to expenses, not invoices) for this period
      // Include debit notes that have expense applications, even if in DRAFT status
      const supplierDebitNotesWithApplicationsSubquery =
        this.debitNoteExpenseApplicationsRepository
          .createQueryBuilder('dnea')
          .select('DISTINCT dnea.debit_note_id')
          .where('dnea.organization_id = :organizationId', { organizationId })
          .getQuery();

      const supplierDebitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select([
          'SUM(COALESCE(debitNote.base_amount, debitNote.amount)) AS amount',
        ])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
        .andWhere('debitNote.debit_note_date <= :endDate', { endDate })
        .andWhere('debitNote.expense_id IS NOT NULL') // Only supplier debit notes
        .andWhere(
          '(debitNote.status IN (:...statuses) OR debitNote.id IN (' +
            supplierDebitNotesWithApplicationsSubquery +
            '))',
          {
            statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
          },
        );

      const supplierDebitNotesRow = await supplierDebitNotesQuery.getRawOne();
      const supplierDebitNotesAmount = Number(
        supplierDebitNotesRow?.amount || 0,
      );

      expenseRows.forEach((row) => {
        const debit = Number(row.debit || 0);
        if (debit > 0) {
          accounts.push({
            accountName: row.accountname || row.accountName,
            accountType: row.accounttype || row.accountType,
            debit,
            credit: 0,
            balance: debit,
          });
        }
      });

      // Add supplier debit notes as a credit to expenses (reduces expenses)
      if (supplierDebitNotesAmount > 0) {
        accounts.push({
          accountName: 'Supplier Debit Notes',
          accountType: 'Expense',
          debit: 0,
          credit: supplierDebitNotesAmount,
          balance: -supplierDebitNotesAmount,
        });
      }

      const revenueQuery = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select([
          "'Sales Revenue' AS accountName",
          "'Revenue' AS accountType",
          '0 AS debit',
          'SUM(COALESCE(invoice.base_amount, invoice.amount)) AS credit',
        ])
        .where('invoice.organization_id = :organizationId', { organizationId })
        .andWhere('invoice.invoice_date >= :startDate', { startDate })
        .andWhere('invoice.invoice_date <= :endDate', { endDate });

      if (filters?.['status']) {
        const statuses = Array.isArray(filters.status)
          ? filters.status
          : [filters.status];
        revenueQuery.andWhere('invoice.status IN (:...statuses)', { statuses });
      }

      const revenueRow = await revenueQuery.getRawOne();
      const revenueCredit = Number(revenueRow?.credit || 0);
      this.logger.debug(
        `Revenue credit: ${revenueCredit}, organizationId=${organizationId}`,
      );

      // Include credit notes that have applications, even if in DRAFT status
      // This ensures credit notes applied to invoices reduce revenue properly
      const creditNotesWithApplicationsSubquery =
        this.creditNoteApplicationsRepository
          .createQueryBuilder('cna')
          .select('DISTINCT cna.credit_note_id')
          .where('cna.organization_id = :organizationId', { organizationId })
          .getQuery();

      const creditNotesQuery = this.creditNotesRepository
        .createQueryBuilder('creditNote')
        .select([
          'SUM(COALESCE(creditNote.base_amount, creditNote.amount)) AS amount',
        ])
        .where('creditNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('creditNote.credit_note_date >= :startDate', { startDate })
        .andWhere('creditNote.credit_note_date <= :endDate', { endDate })
        .andWhere(
          '(creditNote.status IN (:...statuses) OR creditNote.id IN (' +
            creditNotesWithApplicationsSubquery +
            '))',
          {
            statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
          },
        );

      const creditNotesRow = await creditNotesQuery.getRawOne();
      const creditNotesAmount = Number(creditNotesRow?.amount || 0);
      this.logger.debug(
        `Credit notes amount: ${creditNotesAmount}, organizationId=${organizationId}`,
      );

      // Customer debit notes (for sales invoices) - increase revenue
      // Only include debit notes linked to invoices, not expenses
      const customerDebitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select([
          'SUM(COALESCE(debitNote.base_amount, debitNote.amount)) AS amount',
        ])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
        .andWhere('debitNote.debit_note_date <= :endDate', { endDate })
        .andWhere('debitNote.invoice_id IS NOT NULL') // Only customer debit notes
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        });

      const customerDebitNotesRow = await customerDebitNotesQuery.getRawOne();
      const customerDebitNotesAmount = Number(
        customerDebitNotesRow?.amount || 0,
      );
      this.logger.debug(
        `Customer debit notes amount: ${customerDebitNotesAmount}, organizationId=${organizationId}`,
      );

      const revenueDebit = creditNotesAmount;
      const totalRevenueCredit = revenueCredit + customerDebitNotesAmount;
      const revenueBalance = totalRevenueCredit - revenueDebit;
      this.logger.debug(
        `Revenue calculations: debit=${revenueDebit}, credit=${totalRevenueCredit}, balance=${revenueBalance}, organizationId=${organizationId}`,
      );

      accounts.push({
        accountName: 'Sales Revenue',
        accountType: 'Revenue',
        debit: revenueDebit,
        credit: totalRevenueCredit,
        balance: revenueBalance,
      });

      // Subquery to calculate paid amount for each expense (for end date)
      const expensePaymentsSubqueryEnd = this.expensePaymentsRepository
        .createQueryBuilder('payment')
        .select('COALESCE(SUM(payment.amount), 0)')
        .where('payment.expense_id = expense.id')
        .andWhere('payment.payment_date <= :endDate')
        .andWhere('payment.organization_id = :organizationId')
        .andWhere('payment.is_deleted = false')
        .getQuery();

      // Subquery to calculate debit note applications for each expense (for end date)
      const debitNoteExpenseApplicationsSubqueryEnd =
        this.debitNoteExpenseApplicationsRepository
          .createQueryBuilder('dnea')
          .select('COALESCE(SUM(dnea.appliedAmount), 0)')
          .where('dnea.expense_id = expense.id')
          .andWhere('dnea.organization_id = :organizationId')
          .getQuery();

      // Subquery to calculate paid amount for each expense (for start date)
      const expensePaymentsSubqueryStart = this.expensePaymentsRepository
        .createQueryBuilder('payment')
        .select('COALESCE(SUM(payment.amount), 0)')
        .where('payment.expense_id = expense.id')
        .andWhere('payment.payment_date < :startDate')
        .andWhere('payment.organization_id = :organizationId')
        .andWhere('payment.is_deleted = false')
        .getQuery();

      // Subquery to calculate debit note applications for each expense (for start date)
      const debitNoteExpenseApplicationsSubqueryStart =
        this.debitNoteExpenseApplicationsRepository
          .createQueryBuilder('dnea')
          .select('COALESCE(SUM(dnea.appliedAmount), 0)')
          .where('dnea.expense_id = expense.id')
          .andWhere('dnea.organization_id = :organizationId')
          .getQuery();

      // Calculate Accounts Payable based on unpaid expenses linked to accruals
      // Outstanding = expense.total_amount - payments - debit_note_applications
      // Only include accruals where expense has not been fully paid
      const accrualsAtEndQuery = this.accrualsRepository
        .createQueryBuilder('accrual')
        .leftJoin('accrual.expense', 'expense')
        .select([
          `SUM(GREATEST(0, COALESCE(expense.total_amount, 0) - (${expensePaymentsSubqueryEnd}) - (${debitNoteExpenseApplicationsSubqueryEnd}))) AS credit`,
        ])
        .where('accrual.organization_id = :organizationId', { organizationId })
        .andWhere('accrual.is_deleted = false')
        .andWhere('expense.is_deleted = false')
        .andWhere('accrual.status = :status', {
          status: AccrualStatus.PENDING_SETTLEMENT,
        })
        .andWhere('expense.expense_date <= :endDate', { endDate })
        .andWhere(
          `COALESCE(expense.total_amount, 0) > (${expensePaymentsSubqueryEnd}) + (${debitNoteExpenseApplicationsSubqueryEnd})`,
        )
        .setParameter('organizationId', organizationId)
        .setParameter('endDate', endDate)
        .setParameter('startDate', startDate);

      const accrualsAtStartQuery = this.accrualsRepository
        .createQueryBuilder('accrual')
        .leftJoin('accrual.expense', 'expense')
        .select([
          `SUM(GREATEST(0, COALESCE(expense.total_amount, 0) - (${expensePaymentsSubqueryStart}) - (${debitNoteExpenseApplicationsSubqueryStart}))) AS credit`,
        ])
        .where('accrual.organization_id = :organizationId', { organizationId })
        .andWhere('accrual.is_deleted = false')
        .andWhere('expense.is_deleted = false')
        .andWhere('accrual.status = :status', {
          status: AccrualStatus.PENDING_SETTLEMENT,
        })
        .andWhere('expense.expense_date < :startDate', { startDate })
        .andWhere(
          `COALESCE(expense.total_amount, 0) > (${expensePaymentsSubqueryStart}) + (${debitNoteExpenseApplicationsSubqueryStart})`,
        )
        .setParameter('organizationId', organizationId)
        .setParameter('endDate', endDate)
        .setParameter('startDate', startDate);

      const [accrualsAtEndRow, accrualsAtStartRow] = await Promise.all([
        accrualsAtEndQuery.getRawOne(),
        accrualsAtStartQuery.getRawOne(),
      ]);

      // Debug logging for Accounts Payable calculation
      this.logger.debug(
        `Trial Balance Accounts Payable - accrualsAtEndRow: ${JSON.stringify(accrualsAtEndRow)}, accrualsAtStartRow: ${JSON.stringify(accrualsAtStartRow)}`,
      );

      const accrualsAtEnd = Number(accrualsAtEndRow?.credit || 0);
      const accrualsAtStart = Number(accrualsAtStartRow?.credit || 0);
      const accrualsPeriodMovement = accrualsAtEnd - accrualsAtStart;

      const accrualsPeriodDebit =
        accrualsPeriodMovement < 0 ? Math.abs(accrualsPeriodMovement) : 0;
      const accrualsPeriodCredit =
        accrualsPeriodMovement > 0 ? accrualsPeriodMovement : 0;
      // Closing balance should be the total outstanding (accrualsAtEnd) as credit
      const apClosingBalance = accrualsAtEnd;

      // Always add AP account if there's any balance (opening or closing)
      if (
        accrualsAtStart > 0 ||
        accrualsAtEnd > 0 ||
        accrualsPeriodDebit > 0 ||
        accrualsPeriodCredit > 0
      ) {
        accounts.push({
          accountName: 'Accounts Payable',
          accountType: 'Liability',
          debit: accrualsPeriodDebit,
          credit:
            accrualsPeriodCredit + (accrualsAtStart > 0 ? accrualsAtStart : 0), // Include opening balance in credit
          balance: apClosingBalance, // Closing balance (positive = credit for liability)
        });
      }

      const creditNoteApplicationsSubqueryEnd =
        this.creditNoteApplicationsRepository
          .createQueryBuilder('cna')
          .select('COALESCE(SUM(cna.appliedAmount), 0)')
          .where('cna.invoice_id = invoice.id')
          .andWhere('cna.organization_id = :organizationId', { organizationId })
          .getQuery();

      const creditNoteApplicationsSubqueryStart =
        this.creditNoteApplicationsRepository
          .createQueryBuilder('cna')
          .select('COALESCE(SUM(cna.appliedAmount), 0)')
          .where('cna.invoice_id = invoice.id')
          .andWhere('cna.organization_id = :organizationId', { organizationId })
          .getQuery();

      // Calculate receivables - match Balance Sheet query EXACTLY
      // Balance Sheet uses: invoice_date <= asOfDate with payment_status filter
      // Trial Balance should use: invoice_date <= endDate with same payment_status filter
      // Note: Balance Sheet selects both 'category' and 'amount', but we only need the amount
      const receivablesAtEndQuery = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select([
          `SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0) - (${creditNoteApplicationsSubqueryEnd})) AS invoiceAmount`,
        ])
        .where('invoice.organization_id = :organizationId', { organizationId })
        .andWhere('invoice.invoice_date <= :endDate', { endDate })
        .andWhere('invoice.payment_status IN (:...statuses)', {
          statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
        })
        .setParameter('organizationId', organizationId)
        .setParameter('endDate', endDate);

      const receivablesAtStartQuery = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select([
          `SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0) - (${creditNoteApplicationsSubqueryStart})) AS invoiceAmount`,
        ])
        .where('invoice.organization_id = :organizationId', { organizationId })
        .andWhere('invoice.invoice_date < :startDate', { startDate })
        .andWhere('invoice.payment_status IN (:...statuses)', {
          statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
        })
        .setParameter('organizationId', organizationId)
        .setParameter('startDate', startDate);

      // Customer debit notes (for accounts receivable in Trial Balance)
      // Only include debit notes linked to invoices, not expenses
      const debitNotesAtEndQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select(['SUM(COALESCE(debitNote.total_amount, 0)) AS debit'])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.debit_note_date <= :endDate', { endDate })
        .andWhere('debitNote.invoice_id IS NOT NULL') // Only customer debit notes
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        });

      const debitNotesAtStartQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select(['SUM(COALESCE(debitNote.total_amount, 0)) AS debit'])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.debit_note_date < :startDate', { startDate })
        .andWhere('debitNote.invoice_id IS NOT NULL') // Only customer debit notes
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        });

      const [
        receivablesAtEndRow,
        receivablesAtStartRow,
        debitNotesAtEndRow,
        debitNotesAtStartRow,
      ] = await Promise.all([
        receivablesAtEndQuery.getRawOne(),
        receivablesAtStartQuery.getRawOne(),
        debitNotesAtEndQuery.getRawOne(),
        debitNotesAtStartQuery.getRawOne(),
      ]);

      // Handle potential negative values (overpaid invoices) - only count positive receivables
      // CRITICAL FIX: TypeORM getRawOne() returns lowercase field names from SQL aliases
      // The query uses "AS invoiceAmount" but getRawOne() returns it as "invoiceamount" (lowercase)
      // Balance Sheet works because it uses "AS amount" (already lowercase)
      const receivablesAtEndRaw = Number(
        receivablesAtEndRow?.invoiceamount ||
          receivablesAtEndRow?.invoiceAmount ||
          0,
      );
      const receivablesAtStartRaw = Number(
        receivablesAtStartRow?.invoiceamount ||
          receivablesAtStartRow?.invoiceAmount ||
          0,
      );

      const receivablesAtEnd =
        receivablesAtEndRaw > 0 ? receivablesAtEndRaw : 0;
      const receivablesAtStart =
        receivablesAtStartRaw > 0 ? receivablesAtStartRaw : 0;
      const debitNotesAtEnd = Number(debitNotesAtEndRow?.debit || 0);
      const debitNotesAtStart = Number(debitNotesAtStartRow?.debit || 0);

      const arAtEnd = receivablesAtEnd + debitNotesAtEnd;
      const arAtStart = receivablesAtStart + debitNotesAtStart;
      const arPeriodMovement = arAtEnd - arAtStart;

      // For Trial Balance: AR should show closing balance as DEBIT
      // Period movement: positive = increase (debit), negative = decrease (credit)
      const arPeriodDebit = arPeriodMovement > 0 ? arPeriodMovement : 0;
      const arPeriodCredit =
        arPeriodMovement < 0 ? Math.abs(arPeriodMovement) : 0;
      // Closing balance is the total outstanding (arAtEnd) - should be positive debit
      const arClosingBalance = arAtEnd;

      // Always add AR account if there's any balance (opening or closing)
      // Match Balance Sheet logic exactly: show if netReceivablesAmount > 0
      // arAtEnd (closing balance) should equal netReceivablesAmount in Balance Sheet
      // Use same condition as Balance Sheet: if closing balance > 0, always show
      // Also show if there's an opening balance (even if closing is 0) or any period movement
      if (
        arAtEnd > 0 ||
        arAtStart > 0 ||
        arPeriodDebit > 0 ||
        arPeriodCredit > 0
      ) {
        accounts.push({
          accountName: 'Accounts Receivable',
          accountType: 'Asset',
          debit: arPeriodDebit + (arAtStart > 0 ? arAtStart : 0), // Include opening balance in debit
          credit: arPeriodCredit,
          balance: arClosingBalance, // Closing balance (positive = debit for asset)
        });
      }

      const vatReceivableQuery = this.expensesRepository
        .createQueryBuilder('expense')
        .select([
          "'VAT Receivable (Input VAT)' AS accountName",
          "'Asset' AS accountType",
          'SUM(COALESCE(expense.vat_amount, 0)) AS debit',
          '0 AS credit',
        ])
        .where('expense.organization_id = :organizationId', { organizationId })
        .andWhere('expense.is_deleted = false')
        .andWhere('expense.expense_date >= :startDate', { startDate })
        .andWhere('expense.expense_date <= :endDate', { endDate })
        .andWhere('expense.vat_amount > 0')
        .andWhere("(expense.type IS NULL OR expense.type != 'credit')");

      if (filters?.['type']) {
        const types = Array.isArray(filters.type)
          ? filters.type
          : [filters.type];
        vatReceivableQuery.andWhere('expense.type IN (:...types)', { types });
      }

      const vatReceivableRow = await vatReceivableQuery.getRawOne();
      const vatReceivableDebit = Number(vatReceivableRow?.debit || 0);

      // Get supplier debit note VAT for this period
      const supplierDebitNoteVatQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select(['SUM(COALESCE(debitNote.vat_amount, 0)) AS vat'])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
        .andWhere('debitNote.debit_note_date <= :endDate', { endDate })
        .andWhere('debitNote.expense_id IS NOT NULL') // Only supplier debit notes
        .andWhere('debitNote.vat_amount > 0')
        .andWhere(
          '(debitNote.status IN (:...statuses) OR debitNote.id IN (' +
            supplierDebitNotesWithApplicationsSubquery +
            '))',
          {
            statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
          },
        );

      const supplierDebitNoteVatRow =
        await supplierDebitNoteVatQuery.getRawOne();
      const supplierDebitNoteVat = Number(supplierDebitNoteVatRow?.vat || 0);

      const netVatReceivable = vatReceivableDebit - supplierDebitNoteVat;
      if (netVatReceivable > 0 || supplierDebitNoteVat > 0) {
        accounts.push({
          accountName: 'VAT Receivable (Input VAT)',
          accountType: 'Asset',
          debit: vatReceivableDebit,
          credit: supplierDebitNoteVat,
          balance: netVatReceivable,
        });
      }

      const vatPayableQuery = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select([
          "'VAT Payable (Output VAT)' AS accountName",
          "'Liability' AS accountType",
          '0 AS debit',
          'SUM(COALESCE(invoice.vat_amount, 0)) AS credit',
        ])
        .where('invoice.organization_id = :organizationId', { organizationId })
        .andWhere('invoice.invoice_date >= :startDate', { startDate })
        .andWhere('invoice.invoice_date <= :endDate', { endDate })
        .andWhere('invoice.vat_amount > 0');

      if (filters?.['status']) {
        const statuses = Array.isArray(filters.status)
          ? filters.status
          : [filters.status];
        vatPayableQuery.andWhere('invoice.status IN (:...statuses)', {
          statuses,
        });
      }

      const vatPayableRow = await vatPayableQuery.getRawOne();
      const vatPayableCredit = Number(vatPayableRow?.credit || 0);

      const vatCreditNotesQuery = this.creditNotesRepository
        .createQueryBuilder('creditNote')
        .select(['SUM(COALESCE(creditNote.vat_amount, 0)) AS debit'])
        .where('creditNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('creditNote.credit_note_date >= :startDate', { startDate })
        .andWhere('creditNote.credit_note_date <= :endDate', { endDate })
        .andWhere('creditNote.status IN (:...statuses)', {
          statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
        })
        .andWhere('creditNote.vat_amount > 0');

      const vatCreditNotesRow = await vatCreditNotesQuery.getRawOne();
      const vatCreditNotesDebit = Number(vatCreditNotesRow?.debit || 0);

      const vatDebitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select(['SUM(COALESCE(debitNote.vat_amount, 0)) AS credit'])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
        .andWhere('debitNote.debit_note_date <= :endDate', { endDate })
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        })
        .andWhere('debitNote.vat_amount > 0');

      const vatDebitNotesRow = await vatDebitNotesQuery.getRawOne();
      const vatDebitNotesCredit = Number(vatDebitNotesRow?.credit || 0);

      const netVatPayableDebit = vatCreditNotesDebit;
      const netVatPayableCredit = vatPayableCredit + vatDebitNotesCredit;

      accounts.push({
        accountName: 'VAT Payable (Output VAT)',
        accountType: 'Liability',
        debit: netVatPayableDebit,
        credit: netVatPayableCredit,
        balance: netVatPayableCredit - netVatPayableDebit,
      });

      // Separate cash and bank payments
      const openingExpensePaymentsQuery = this.expensePaymentsRepository
        .createQueryBuilder('payment')
        .select([
          `SUM(CASE WHEN payment.payment_method = '${PaymentMethod.CASH}' THEN COALESCE(payment.amount, 0) ELSE 0 END) AS cashPayments`,
          `SUM(CASE WHEN payment.payment_method = '${PaymentMethod.BANK_TRANSFER}' THEN COALESCE(payment.amount, 0) ELSE 0 END) AS bankPayments`,
          `SUM(CASE WHEN payment.payment_method NOT IN ('${PaymentMethod.CASH}', '${PaymentMethod.BANK_TRANSFER}') OR payment.payment_method IS NULL THEN COALESCE(payment.amount, 0) ELSE 0 END) AS otherPayments`,
        ])
        .where('payment.organization_id = :organizationId', { organizationId })
        .andWhere('payment.is_deleted = false')
        .andWhere('payment.deleted_at IS NULL')
        .andWhere('payment.payment_date < :startDate', { startDate });

      const openingInvoicePaymentsQuery = this.invoicePaymentsRepository
        .createQueryBuilder('payment')
        .select([
          "SUM(CASE WHEN payment.payment_method = 'cash' THEN COALESCE(payment.amount, 0) ELSE 0 END) AS cashReceipts",
          "SUM(CASE WHEN payment.payment_method = 'bank_transfer' THEN COALESCE(payment.amount, 0) ELSE 0 END) AS bankReceipts",
          "SUM(CASE WHEN payment.payment_method NOT IN ('cash', 'bank_transfer') OR payment.payment_method IS NULL THEN COALESCE(payment.amount, 0) ELSE 0 END) AS otherReceipts",
        ])
        .where('payment.organization_id = :organizationId', { organizationId })
        .andWhere('payment.payment_date < :startDate', { startDate });

      // Query journal entries for Cash separately (opening)
      const openingCashJournalEntriesQuery = this.journalEntriesRepository
        .createQueryBuilder('entry')
        .select([
          "SUM(CASE WHEN entry.debit_account = 'cash' THEN entry.amount ELSE 0 END) AS received",
          "SUM(CASE WHEN entry.credit_account = 'cash' THEN entry.amount ELSE 0 END) AS paid",
        ])
        .where('entry.organization_id = :organizationId', { organizationId })
        .andWhere('entry.entry_date < :startDate', { startDate })
        .andWhere(
          "(entry.debit_account = 'cash' OR entry.credit_account = 'cash')",
        );

      // Query journal entries for Bank separately (opening)
      const openingBankJournalEntriesQuery = this.journalEntriesRepository
        .createQueryBuilder('entry')
        .select([
          "SUM(CASE WHEN entry.debit_account = 'bank' THEN entry.amount ELSE 0 END) AS received",
          "SUM(CASE WHEN entry.credit_account = 'bank' THEN entry.amount ELSE 0 END) AS paid",
        ])
        .where('entry.organization_id = :organizationId', { organizationId })
        .andWhere('entry.entry_date < :startDate', { startDate })
        .andWhere(
          "(entry.debit_account = 'bank' OR entry.credit_account = 'bank')",
        );

      // Separate cash and bank payments for period
      const periodExpensePaymentsQuery = this.expensePaymentsRepository
        .createQueryBuilder('payment')
        .select([
          `SUM(CASE WHEN payment.payment_method = '${PaymentMethod.CASH}' THEN COALESCE(payment.amount, 0) ELSE 0 END) AS cashPayments`,
          `SUM(CASE WHEN payment.payment_method = '${PaymentMethod.BANK_TRANSFER}' THEN COALESCE(payment.amount, 0) ELSE 0 END) AS bankPayments`,
          `SUM(CASE WHEN payment.payment_method NOT IN ('${PaymentMethod.CASH}', '${PaymentMethod.BANK_TRANSFER}') OR payment.payment_method IS NULL THEN COALESCE(payment.amount, 0) ELSE 0 END) AS otherPayments`,
        ])
        .where('payment.organization_id = :organizationId', { organizationId })
        .andWhere('payment.is_deleted = false')
        .andWhere('payment.deleted_at IS NULL')
        .andWhere('payment.payment_date >= :startDate', { startDate })
        .andWhere('payment.payment_date <= :endDate', { endDate });

      const periodInvoicePaymentsQuery = this.invoicePaymentsRepository
        .createQueryBuilder('payment')
        .select([
          "SUM(CASE WHEN payment.payment_method = 'cash' THEN COALESCE(payment.amount, 0) ELSE 0 END) AS cashReceipts",
          "SUM(CASE WHEN payment.payment_method = 'bank_transfer' THEN COALESCE(payment.amount, 0) ELSE 0 END) AS bankReceipts",
          "SUM(CASE WHEN payment.payment_method NOT IN ('cash', 'bank_transfer') OR payment.payment_method IS NULL THEN COALESCE(payment.amount, 0) ELSE 0 END) AS otherReceipts",
        ])
        .where('payment.organization_id = :organizationId', { organizationId })
        .andWhere('payment.payment_date >= :startDate', { startDate })
        .andWhere('payment.payment_date <= :endDate', { endDate });

      // Query journal entries for Cash separately (period)
      const periodCashJournalEntriesQuery = this.journalEntriesRepository
        .createQueryBuilder('entry')
        .select([
          "SUM(CASE WHEN entry.debit_account = 'cash' THEN entry.amount ELSE 0 END) AS received",
          "SUM(CASE WHEN entry.credit_account = 'cash' THEN entry.amount ELSE 0 END) AS paid",
        ])
        .where('entry.organization_id = :organizationId', { organizationId })
        .andWhere('entry.entry_date >= :startDate', { startDate })
        .andWhere('entry.entry_date <= :endDate', { endDate })
        .andWhere(
          "(entry.debit_account = 'cash' OR entry.credit_account = 'cash')",
        );

      // Query journal entries for Bank separately (period)
      const periodBankJournalEntriesQuery = this.journalEntriesRepository
        .createQueryBuilder('entry')
        .select([
          "SUM(CASE WHEN entry.debit_account = 'bank' THEN entry.amount ELSE 0 END) AS received",
          "SUM(CASE WHEN entry.credit_account = 'bank' THEN entry.amount ELSE 0 END) AS paid",
        ])
        .where('entry.organization_id = :organizationId', { organizationId })
        .andWhere('entry.entry_date >= :startDate', { startDate })
        .andWhere('entry.entry_date <= :endDate', { endDate })
        .andWhere(
          "(entry.debit_account = 'bank' OR entry.credit_account = 'bank')",
        );

      const [
        openingExpensePaymentsRow,
        openingInvoicePaymentsRow,
        openingCashJournalEntriesRow,
        openingBankJournalEntriesRow,
        periodExpensePaymentsRow,
        periodInvoicePaymentsRow,
        periodCashJournalEntriesRow,
        periodBankJournalEntriesRow,
      ] = await Promise.all([
        openingExpensePaymentsQuery.getRawOne(),
        openingInvoicePaymentsQuery.getRawOne(),
        openingCashJournalEntriesQuery.getRawOne(),
        openingBankJournalEntriesQuery.getRawOne(),
        periodExpensePaymentsQuery.getRawOne(),
        periodInvoicePaymentsQuery.getRawOne(),
        periodCashJournalEntriesQuery.getRawOne(),
        periodBankJournalEntriesQuery.getRawOne(),
      ]);

      // Calculate Cash separately
      // Debug: Check actual field names from query results
      this.logger.debug(
        `Trial Balance Cash Query Results - openingExpensePaymentsRow: ${JSON.stringify(openingExpensePaymentsRow)}, periodExpensePaymentsRow: ${JSON.stringify(periodExpensePaymentsRow)}`,
      );
      this.logger.debug(
        `Trial Balance Cash Query Results - openingInvoicePaymentsRow: ${JSON.stringify(openingInvoicePaymentsRow)}, periodInvoicePaymentsRow: ${JSON.stringify(periodInvoicePaymentsRow)}`,
      );

      const openingCashReceipts = Number(
        openingInvoicePaymentsRow?.cashreceipts ||
          openingInvoicePaymentsRow?.cashReceipts ||
          0,
      );
      const openingCashPayments = Number(
        openingExpensePaymentsRow?.cashpayments ||
          openingExpensePaymentsRow?.cashPayments ||
          0,
      );
      // Journal entries for cash (no splitting - direct from cash account)
      const openingCashJournalReceived = Number(
        openingCashJournalEntriesRow?.received || 0,
      );
      const openingCashJournalPaid = Number(
        openingCashJournalEntriesRow?.paid || 0,
      );
      const openingCashBalance =
        openingCashReceipts -
        openingCashPayments +
        openingCashJournalReceived -
        openingCashJournalPaid;

      const periodCashReceipts = Number(
        periodInvoicePaymentsRow?.cashreceipts ||
          periodInvoicePaymentsRow?.cashReceipts ||
          0,
      );
      const periodCashPayments = Number(
        periodExpensePaymentsRow?.cashpayments ||
          periodExpensePaymentsRow?.cashPayments ||
          0,
      );
      const periodCashJournalReceived = Number(
        periodCashJournalEntriesRow?.received || 0,
      );
      const periodCashJournalPaid = Number(
        periodCashJournalEntriesRow?.paid || 0,
      );

      // Debug logging for cash calculation
      this.logger.debug(
        `Trial Balance Cash Calculation: receipts=${periodCashReceipts}, payments=${periodCashPayments}, ` +
          `journalReceived=${periodCashJournalReceived}, journalPaid=${periodCashJournalPaid}, ` +
          `openingBalance=${openingCashBalance}, closingBalance=${openingCashBalance + periodCashReceipts - periodCashPayments + periodCashJournalReceived - periodCashJournalPaid}, ` +
          `organizationId=${organizationId}, period=${startDate} to ${endDate}`,
      );

      const periodCashDebit = periodCashReceipts + periodCashJournalReceived;
      const periodCashCredit = periodCashPayments + periodCashJournalPaid;

      const closingCashBalance =
        openingCashBalance +
        periodCashReceipts -
        periodCashPayments +
        periodCashJournalReceived -
        periodCashJournalPaid;

      // Calculate Bank separately
      const openingBankReceipts = Number(
        openingInvoicePaymentsRow?.bankreceipts ||
          openingInvoicePaymentsRow?.bankReceipts ||
          0,
      );
      const openingBankPayments = Number(
        openingExpensePaymentsRow?.bankpayments ||
          openingExpensePaymentsRow?.bankPayments ||
          0,
      );
      // Journal entries for bank (no splitting - direct from bank account)
      const openingBankJournalReceived = Number(
        openingBankJournalEntriesRow?.received || 0,
      );
      const openingBankJournalPaid = Number(
        openingBankJournalEntriesRow?.paid || 0,
      );
      const openingBankBalance =
        openingBankReceipts -
        openingBankPayments +
        openingBankJournalReceived -
        openingBankJournalPaid;

      const periodBankReceipts = Number(
        periodInvoicePaymentsRow?.bankreceipts ||
          periodInvoicePaymentsRow?.bankReceipts ||
          0,
      );
      const periodBankPayments = Number(
        periodExpensePaymentsRow?.bankpayments ||
          periodExpensePaymentsRow?.bankPayments ||
          0,
      );
      const periodBankJournalReceived = Number(
        periodBankJournalEntriesRow?.received || 0,
      );
      const periodBankJournalPaid = Number(
        periodBankJournalEntriesRow?.paid || 0,
      );
      const periodBankDebit = periodBankReceipts + periodBankJournalReceived;
      const periodBankCredit = periodBankPayments + periodBankJournalPaid;

      const closingBankBalance =
        openingBankBalance +
        periodBankReceipts -
        periodBankPayments +
        periodBankJournalReceived -
        periodBankJournalPaid;

      // Add Cash account
      accounts.push({
        accountName: 'Cash',
        accountType: 'Asset',
        debit: periodCashDebit,
        credit: periodCashCredit,
        balance: closingCashBalance,
      });

      // Add Bank account
      accounts.push({
        accountName: 'Bank',
        accountType: 'Asset',
        debit: periodBankDebit,
        credit: periodBankCredit,
        balance: closingBankBalance,
      });

      // Get journal entries grouped by account (excluding Cash and Bank which are handled separately)
      const journalEntriesQuery = this.journalEntriesRepository
        .createQueryBuilder('entry')
        .select([
          'entry.debit_account AS debitAccount',
          'entry.credit_account AS creditAccount',
          'SUM(entry.amount) AS amount',
        ])
        .where('entry.organization_id = :organizationId', { organizationId })
        .andWhere('entry.entry_date >= :startDate', { startDate })
        .andWhere('entry.entry_date <= :endDate', { endDate })
        .andWhere("entry.debit_account NOT IN ('cash', 'bank')")
        .andWhere("entry.credit_account NOT IN ('cash', 'bank')")
        .groupBy('entry.debit_account')
        .addGroupBy('entry.credit_account');

      const journalRows = await journalEntriesQuery.getRawMany();

      // Aggregate by account (debit side and credit side separately)
      const accountMap = new Map<string, { debit: number; credit: number }>();

      journalRows.forEach((row) => {
        const amount = Number(row.amount || 0);
        const debitAccount = row.debitaccount || row.debitAccount;
        const creditAccount = row.creditaccount || row.creditAccount;

        // Add to debit account (including liability accounts when they are debited)
        // This ensures liability accounts appear on the debit side when debited
        if (
          debitAccount &&
          debitAccount !== 'cash' &&
          debitAccount !== 'bank'
        ) {
          const existing = accountMap.get(debitAccount) || {
            debit: 0,
            credit: 0,
          };
          existing.debit += amount;
          accountMap.set(debitAccount, existing);
        }

        // Add to credit account (including liability accounts when they are credited)
        if (
          creditAccount &&
          creditAccount !== 'cash' &&
          creditAccount !== 'bank'
        ) {
          const existing = accountMap.get(creditAccount) || {
            debit: 0,
            credit: 0,
          };
          existing.credit += amount;
          accountMap.set(creditAccount, existing);
        }
      });

      // Convert to accounts array
      // Note: If journal entries use 'accounts_receivable' account, they will create an entry
      // with the same name "Accounts Receivable". We need to merge it with the main AR entry
      // that was added earlier from invoices/debit notes.
      const existingARIndex = accounts.findIndex(
        (acc) => acc.accountName === 'Accounts Receivable',
      );

      accountMap.forEach((balances, accountCode) => {
        if (balances.debit > 0 || balances.credit > 0) {
          const accountMeta =
            ACCOUNT_METADATA[accountCode as JournalEntryAccount];
          const accountName = accountMeta?.name || accountCode;
          const accountType = accountMeta?.category
            ? accountMeta.category.charAt(0).toUpperCase() +
              accountMeta.category.slice(1)
            : 'Journal Entry';

          // If this is Accounts Receivable from journal entries, merge with existing entry
          if (accountName === 'Accounts Receivable' && existingARIndex >= 0) {
            const existingAR = accounts[existingARIndex];
            // Merge journal entry amounts with existing AR entry
            existingAR.debit += balances.debit;
            existingAR.credit += balances.credit;
            const isCreditAccount =
              accountType === 'Equity' ||
              accountType === 'Revenue' ||
              accountType === 'Liability';
            const journalBalance = isCreditAccount
              ? balances.credit - balances.debit
              : balances.debit - balances.credit;
            // Update balance: for assets, balance = debit - credit
            if (accountType === 'Asset') {
              existingAR.balance = existingAR.debit - existingAR.credit;
            } else {
              existingAR.balance += journalBalance;
            }
            this.logger.debug(
              `Merged journal entry Accounts Receivable: debit=${balances.debit}, ` +
                `credit=${balances.credit}, into existing AR entry, organizationId=${organizationId}`,
            );
            return; // Skip adding duplicate entry
          }

          const isCreditAccount =
            accountType === 'Equity' ||
            accountType === 'Revenue' ||
            accountType === 'Liability';
          const balance = isCreditAccount
            ? balances.credit - balances.debit
            : balances.debit - balances.credit;

          accounts.push({
            accountName,
            accountType,
            debit: balances.debit,
            credit: balances.credit,
            balance,
          });
        }
      });

      // For liability accounts that only have credits (no debits),
      // also add them to the debit list with debit: 0 so they appear in both lists
      accountMap.forEach((balances, accountCode) => {
        const accountMeta =
          ACCOUNT_METADATA[accountCode as JournalEntryAccount];
        if (accountMeta?.category === 'liability') {
          const accountName = accountMeta?.name || accountCode;
          // If liability has credits but no debits, ensure it's in the list
          // (it should already be there from above, but this ensures visibility)
          const existingAccount = accounts.find(
            (acc) => acc.accountName === accountName,
          );
          if (!existingAccount && balances.credit > 0) {
            // This shouldn't happen due to the logic above, but adding as safety
            accounts.push({
              accountName,
              accountType: 'Liability',
              debit: 0,
              credit: balances.credit,
              balance: balances.credit,
            });
          }
        }
      });

      // Explicitly add Capital accounts if they exist (even with zero period movement)
      // Get opening balances for Capital accounts
      const openingCapitalQuery = this.journalEntriesRepository
        .createQueryBuilder('entry')
        .select([
          'entry.credit_account AS creditAccount',
          'SUM(entry.amount) AS amount',
        ])
        .where('entry.organization_id = :organizationId', { organizationId })
        .andWhere('entry.entry_date < :startDate', { startDate })
        .andWhere(
          "entry.credit_account IN ('share_capital', 'owner_shareholder_account')",
        )
        .groupBy('entry.credit_account');

      const openingCapitalRows = await openingCapitalQuery.getRawMany();
      const openingCapitalMap = new Map<string, number>();
      openingCapitalRows.forEach((row) => {
        const accountCode = row.creditaccount || row.creditAccount;
        openingCapitalMap.set(accountCode, Number(row.amount || 0));
      });

      // Get period movements for Capital accounts
      const periodCapitalQuery = this.journalEntriesRepository
        .createQueryBuilder('entry')
        .select([
          'entry.credit_account AS creditAccount',
          'SUM(entry.amount) AS amount',
        ])
        .where('entry.organization_id = :organizationId', { organizationId })
        .andWhere('entry.entry_date >= :startDate', { startDate })
        .andWhere('entry.entry_date <= :endDate', { endDate })
        .andWhere(
          "entry.credit_account IN ('share_capital', 'owner_shareholder_account')",
        )
        .groupBy('entry.credit_account');

      const periodCapitalRows = await periodCapitalQuery.getRawMany();

      // Add Share Capital if it exists (always show if there's any balance)
      const shareCapitalOpening = openingCapitalMap.get('share_capital') || 0;
      const shareCapitalPeriod = periodCapitalRows.find(
        (r) => (r.creditaccount || r.creditAccount) === 'share_capital',
      );
      const shareCapitalPeriodAmount = shareCapitalPeriod
        ? Number(shareCapitalPeriod.amount || 0)
        : 0;
      const shareCapitalClosing =
        shareCapitalOpening + shareCapitalPeriodAmount;

      // Always add Share Capital if there's any balance
      if (
        shareCapitalOpening > 0 ||
        shareCapitalPeriodAmount > 0 ||
        shareCapitalClosing > 0
      ) {
        accounts.push({
          accountName: 'Share Capital',
          accountType: 'Equity',
          debit: 0,
          // Credit column should only show period transactions, not opening balance
          // Opening balance is tracked separately in openingBalances map
          credit: shareCapitalPeriodAmount,
          balance: shareCapitalClosing, // Closing balance (positive = credit for equity)
        });
      }

      // Add Owner/Shareholder Account if it exists (always show if there's any balance)
      const ownerAccountOpening =
        openingCapitalMap.get('owner_shareholder_account') || 0;
      const ownerAccountPeriod = periodCapitalRows.find(
        (r) =>
          (r.creditaccount || r.creditAccount) === 'owner_shareholder_account',
      );
      const ownerAccountPeriodAmount = ownerAccountPeriod
        ? Number(ownerAccountPeriod.amount || 0)
        : 0;
      const ownerAccountClosing =
        ownerAccountOpening + ownerAccountPeriodAmount;

      // Always add Owner/Shareholder Account if there's any balance
      if (
        ownerAccountOpening > 0 ||
        ownerAccountPeriodAmount > 0 ||
        ownerAccountClosing > 0
      ) {
        accounts.push({
          accountName: 'Owner/Shareholder Account',
          accountType: 'Equity',
          debit: 0,
          // Credit column should only show period transactions, not opening balance
          // Opening balance is tracked separately in openingBalances map
          credit: ownerAccountPeriodAmount,
          balance: ownerAccountClosing, // Closing balance (positive = credit for equity)
        });
      }

      const openingBalances = new Map<
        string,
        { debit: number; credit: number; balance: number }
      >();

      // Add Cash and Bank opening balances (calculated earlier)
      const totalOpeningCashDebit =
        openingCashReceipts + openingCashJournalReceived;
      const totalOpeningCashCredit =
        openingCashPayments + openingCashJournalPaid;
      openingBalances.set('Cash', {
        debit: totalOpeningCashDebit,
        credit: totalOpeningCashCredit,
        balance: openingCashBalance,
      });

      const totalOpeningBankDebit =
        openingBankReceipts + openingBankJournalReceived;
      const totalOpeningBankCredit =
        openingBankPayments + openingBankJournalPaid;
      openingBalances.set('Bank', {
        debit: totalOpeningBankDebit,
        credit: totalOpeningBankCredit,
        balance: openingBankBalance,
      });

      // Add Capital accounts to opening balances map so they're included in opening balance totals
      if (shareCapitalOpening > 0) {
        openingBalances.set('Share Capital', {
          debit: 0,
          credit: shareCapitalOpening,
          balance: shareCapitalOpening, // Positive balance for equity (credit account)
        });
      }

      if (ownerAccountOpening > 0) {
        openingBalances.set('Owner/Shareholder Account', {
          debit: 0,
          credit: ownerAccountOpening,
          balance: ownerAccountOpening, // Positive balance for equity (credit account)
        });
      }

      const openingExpenseQuery = this.expensesRepository
        .createQueryBuilder('expense')
        .leftJoin('expense.category', 'category')
        .select([
          "COALESCE(category.name, 'Uncategorized Expenses') AS accountName",
          'SUM(COALESCE(expense.base_amount, expense.amount)) AS debit',
          '0 AS credit',
        ])
        .where('expense.organization_id = :organizationId', { organizationId })
        .andWhere('expense.is_deleted = false')
        .andWhere('expense.expense_date < :startDate', { startDate })
        .andWhere("(expense.type IS NULL OR expense.type != 'credit')")
        .groupBy('category.name');

      if (filters?.['type']) {
        const types = Array.isArray(filters.type)
          ? filters.type
          : [filters.type];
        openingExpenseQuery.andWhere('expense.type IN (:...types)', { types });
      }

      const openingExpenseRows = await openingExpenseQuery.getRawMany();

      // Get opening supplier debit notes (those linked to expenses, not invoices) for opening balances
      const openingSupplierDebitNotesWithApplicationsSubquery =
        this.debitNoteExpenseApplicationsRepository
          .createQueryBuilder('dnea')
          .select('DISTINCT dnea.debit_note_id')
          .where('dnea.organization_id = :organizationId', { organizationId })
          .getQuery();

      const openingSupplierDebitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select([
          'SUM(COALESCE(debitNote.base_amount, debitNote.amount)) AS amount',
        ])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.debit_note_date < :startDate', { startDate })
        .andWhere('debitNote.expense_id IS NOT NULL') // Only supplier debit notes
        .andWhere(
          '(debitNote.status IN (:...statuses) OR debitNote.id IN (' +
            openingSupplierDebitNotesWithApplicationsSubquery +
            '))',
          {
            statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
          },
        );

      const openingSupplierDebitNotesRow =
        await openingSupplierDebitNotesQuery.getRawOne();
      const openingSupplierDebitNotesAmount = Number(
        openingSupplierDebitNotesRow?.amount || 0,
      );

      openingExpenseRows.forEach((row) => {
        const debit = Number(row.debit || 0);
        if (debit > 0) {
          openingBalances.set(row.accountname || row.accountName, {
            debit,
            credit: 0,
            balance: debit,
          });
        }
      });

      // Add opening supplier debit notes as credit to expenses (reduces expenses)
      if (openingSupplierDebitNotesAmount > 0) {
        const existingOpening = openingBalances.get('Supplier Debit Notes') || {
          debit: 0,
          credit: 0,
          balance: 0,
        };
        openingBalances.set('Supplier Debit Notes', {
          debit: existingOpening.debit,
          credit: existingOpening.credit + openingSupplierDebitNotesAmount,
          balance: existingOpening.balance - openingSupplierDebitNotesAmount,
        });
      }

      const openingRevenueQuery = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select([
          'SUM(COALESCE(invoice.base_amount, invoice.amount)) AS credit',
        ])
        .where('invoice.organization_id = :organizationId', { organizationId })
        .andWhere('invoice.invoice_date < :startDate', { startDate });

      if (filters?.['status']) {
        const statuses = Array.isArray(filters.status)
          ? filters.status
          : [filters.status];
        openingRevenueQuery.andWhere('invoice.status IN (:...statuses)', {
          statuses,
        });
      }

      const openingRevenueRow = await openingRevenueQuery.getRawOne();
      const openingRevenueCredit = Number(openingRevenueRow?.credit || 0);

      // Include opening credit notes that have applications, even if in DRAFT status
      const openingCreditNotesWithApplicationsSubquery =
        this.creditNoteApplicationsRepository
          .createQueryBuilder('cna')
          .select('DISTINCT cna.credit_note_id')
          .where('cna.organization_id = :organizationId', { organizationId })
          .getQuery();

      const openingCreditNotesQuery = this.creditNotesRepository
        .createQueryBuilder('creditNote')
        .select([
          'SUM(COALESCE(creditNote.base_amount, creditNote.amount)) AS amount',
        ])
        .where('creditNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('creditNote.credit_note_date < :startDate', { startDate })
        .andWhere(
          '(creditNote.status IN (:...statuses) OR creditNote.id IN (' +
            openingCreditNotesWithApplicationsSubquery +
            '))',
          {
            statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
          },
        );

      const openingCreditNotesRow = await openingCreditNotesQuery.getRawOne();
      const openingCreditNotesAmount = Number(
        openingCreditNotesRow?.amount || 0,
      );

      // Opening customer debit notes (for sales invoices) - increase revenue
      // Only include debit notes linked to invoices, not expenses
      const openingCustomerDebitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select([
          'SUM(COALESCE(debitNote.base_amount, debitNote.amount)) AS amount',
        ])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.debit_note_date < :startDate', { startDate })
        .andWhere('debitNote.invoice_id IS NOT NULL') // Only customer debit notes
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        });

      const openingCustomerDebitNotesRow =
        await openingCustomerDebitNotesQuery.getRawOne();
      const openingCustomerDebitNotesAmount = Number(
        openingCustomerDebitNotesRow?.amount || 0,
      );

      const openingRevenueDebit = openingCreditNotesAmount;
      const totalOpeningRevenueCredit =
        openingRevenueCredit + openingCustomerDebitNotesAmount;
      const openingRevenueBalance =
        totalOpeningRevenueCredit - openingRevenueDebit;

      openingBalances.set('Sales Revenue', {
        debit: openingRevenueDebit,
        credit: totalOpeningRevenueCredit,
        balance: openingRevenueBalance,
      });

      const openingAccrualsQuery = this.accrualsRepository
        .createQueryBuilder('accrual')
        .select(['SUM(accrual.amount) AS credit'])
        .where('accrual.organization_id = :organizationId', { organizationId })
        .andWhere('accrual.is_deleted = false')
        .andWhere('accrual.status = :status', {
          status: AccrualStatus.PENDING_SETTLEMENT,
        })
        .andWhere('accrual.created_at::date < :startDate', { startDate });

      const openingAccrualsRow = await openingAccrualsQuery.getRawOne();
      const openingAccrualsCredit = Number(openingAccrualsRow?.credit || 0);

      const openingAccrualsBalance = openingAccrualsCredit - 0;

      openingBalances.set('Accounts Payable', {
        debit: 0,
        credit: openingAccrualsCredit,
        balance: openingAccrualsBalance,
      });

      const openingCreditNoteApplicationsSubquery =
        this.creditNoteApplicationsRepository
          .createQueryBuilder('cna')
          .select('COALESCE(SUM(cna.appliedAmount), 0)')
          .where('cna.invoice_id = invoice.id')
          .andWhere('cna.organization_id = :organizationId', { organizationId })
          .getQuery();

      const openingReceivablesQuery = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select([
          `SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0) - (${openingCreditNoteApplicationsSubquery})) AS invoiceAmount`,
        ])
        .where('invoice.organization_id = :organizationId', { organizationId })
        .andWhere('invoice.invoice_date < :startDate', { startDate })
        .andWhere('invoice.payment_status IN (:...statuses)', {
          statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
        })
        .setParameter('organizationId', organizationId);

      const openingReceivablesRow = await openingReceivablesQuery.getRawOne();
      const openingReceivablesDebit = Number(
        openingReceivablesRow?.invoiceAmount || 0,
      );

      // Opening customer debit notes (for accounts receivable)
      // Only include debit notes linked to invoices, not expenses
      const openingReceivablesDebitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select(['SUM(COALESCE(debitNote.total_amount, 0)) AS debit'])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.debit_note_date < :startDate', { startDate })
        .andWhere('debitNote.invoice_id IS NOT NULL') // Only customer debit notes
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        });

      const openingReceivablesDebitNotesRow =
        await openingReceivablesDebitNotesQuery.getRawOne();
      const openingReceivablesDebitNotesDebit = Number(
        openingReceivablesDebitNotesRow?.debit || 0,
      );

      const netOpeningReceivablesDebit =
        openingReceivablesDebit + openingReceivablesDebitNotesDebit;
      const netOpeningReceivablesCredit = 0;

      openingBalances.set('Accounts Receivable', {
        debit: netOpeningReceivablesDebit,
        credit: netOpeningReceivablesCredit,
        balance: netOpeningReceivablesDebit - netOpeningReceivablesCredit,
      });

      const openingVatReceivableQuery = this.expensesRepository
        .createQueryBuilder('expense')
        .select([
          "'VAT Receivable (Input VAT)' AS accountName",
          'SUM(COALESCE(expense.vat_amount, 0)) AS debit',
          '0 AS credit',
        ])
        .where('expense.organization_id = :organizationId', { organizationId })
        .andWhere('expense.is_deleted = false')
        .andWhere('expense.expense_date < :startDate', { startDate })
        .andWhere('expense.vat_amount > 0')
        .andWhere("(expense.type IS NULL OR expense.type != 'credit')");

      if (filters?.['type']) {
        const types = Array.isArray(filters.type)
          ? filters.type
          : [filters.type];
        openingVatReceivableQuery.andWhere('expense.type IN (:...types)', {
          types,
        });
      }

      const openingVatReceivableRow =
        await openingVatReceivableQuery.getRawOne();
      const openingVatReceivableDebit = Number(
        openingVatReceivableRow?.debit || 0,
      );
      if (openingVatReceivableDebit > 0) {
        openingBalances.set('VAT Receivable (Input VAT)', {
          debit: openingVatReceivableDebit,
          credit: 0,
          balance: openingVatReceivableDebit,
        });
      }

      const openingVatPayableQuery = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select(['SUM(COALESCE(invoice.vat_amount, 0)) AS credit'])
        .where('invoice.organization_id = :organizationId', { organizationId })
        .andWhere('invoice.invoice_date < :startDate', { startDate })
        .andWhere('invoice.vat_amount > 0');

      if (filters?.['status']) {
        const statuses = Array.isArray(filters.status)
          ? filters.status
          : [filters.status];
        openingVatPayableQuery.andWhere('invoice.status IN (:...statuses)', {
          statuses,
        });
      }

      const openingVatPayableRow = await openingVatPayableQuery.getRawOne();
      const openingVatPayableCredit = Number(openingVatPayableRow?.credit || 0);

      const openingVatCreditNotesQuery = this.creditNotesRepository
        .createQueryBuilder('creditNote')
        .select(['SUM(COALESCE(creditNote.vat_amount, 0)) AS debit'])
        .where('creditNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('creditNote.credit_note_date < :startDate', { startDate })
        .andWhere('creditNote.status IN (:...statuses)', {
          statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
        })
        .andWhere('creditNote.vat_amount > 0');

      const openingVatCreditNotesRow =
        await openingVatCreditNotesQuery.getRawOne();
      const openingVatCreditNotesDebit = Number(
        openingVatCreditNotesRow?.debit || 0,
      );

      // Opening customer debit note VAT (for VAT Payable)
      // Only include debit notes linked to invoices, not expenses
      const openingVatDebitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select(['SUM(COALESCE(debitNote.vat_amount, 0)) AS credit'])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.debit_note_date < :startDate', { startDate })
        .andWhere('debitNote.invoice_id IS NOT NULL') // Only customer debit notes
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        })
        .andWhere('debitNote.vat_amount > 0');

      const openingVatDebitNotesRow =
        await openingVatDebitNotesQuery.getRawOne();
      const openingVatDebitNotesCredit = Number(
        openingVatDebitNotesRow?.credit || 0,
      );

      const netOpeningVatPayableDebit = openingVatCreditNotesDebit;
      const netOpeningVatPayableCredit =
        openingVatPayableCredit + openingVatDebitNotesCredit;

      openingBalances.set('VAT Payable (Output VAT)', {
        debit: netOpeningVatPayableDebit,
        credit: netOpeningVatPayableCredit,
        balance: netOpeningVatPayableCredit - netOpeningVatPayableDebit,
      });

      // Note: openingCashReceipts, openingCashPayments, openingJournalReceived, openingJournalPaid,
      // openingCashBalance, openingBankBalance are defined later in the code (after Promise.all)
      // We'll set opening balances for Cash and Bank after those variables are calculated
      // This is a placeholder that will be updated below

      const openingJournalQuery = this.journalEntriesRepository
        .createQueryBuilder('entry')
        .select([
          'entry.debit_account AS debitAccount',
          'entry.credit_account AS creditAccount',
          'SUM(entry.amount) AS amount',
        ])
        .where('entry.organization_id = :organizationId', { organizationId })
        .andWhere('entry.entry_date < :startDate', { startDate })
        .andWhere("entry.debit_account NOT IN ('cash', 'bank')")
        .andWhere("entry.credit_account NOT IN ('cash', 'bank')")
        .groupBy('entry.debit_account')
        .addGroupBy('entry.credit_account');

      const openingJournalRows = await openingJournalQuery.getRawMany();

      // Aggregate opening balances by account
      const openingAccountMap = new Map<
        string,
        { debit: number; credit: number }
      >();

      openingJournalRows.forEach((row) => {
        const amount = Number(row.amount || 0);
        const debitAccount = row.debitaccount || row.debitAccount;
        const creditAccount = row.creditaccount || row.creditAccount;

        if (
          debitAccount &&
          debitAccount !== 'cash' &&
          debitAccount !== 'bank'
        ) {
          const existing = openingAccountMap.get(debitAccount) || {
            debit: 0,
            credit: 0,
          };
          existing.debit += amount;
          openingAccountMap.set(debitAccount, existing);
        }

        if (
          creditAccount &&
          creditAccount !== 'cash' &&
          creditAccount !== 'bank'
        ) {
          const existing = openingAccountMap.get(creditAccount) || {
            debit: 0,
            credit: 0,
          };
          existing.credit += amount;
          openingAccountMap.set(creditAccount, existing);
        }
      });

      // Convert to opening balances map
      openingAccountMap.forEach((balances, accountCode) => {
        if (balances.debit > 0 || balances.credit > 0) {
          const accountMeta =
            ACCOUNT_METADATA[accountCode as JournalEntryAccount];
          const accountName = accountMeta?.name || accountCode;
          const accountType = accountMeta?.category || 'asset';

          const isCreditAccount =
            accountType === 'equity' ||
            accountType === 'revenue' ||
            accountType === 'liability';
          const balance = isCreditAccount
            ? balances.credit - balances.debit
            : balances.debit - balances.credit;

          openingBalances.set(accountName, {
            debit: balances.debit,
            credit: balances.credit,
            balance,
          });
        }
      });

      let totalOpeningDebit = 0;
      let totalOpeningCredit = 0;
      openingBalances.forEach((balance) => {
        totalOpeningDebit += balance.debit;
        totalOpeningCredit += balance.credit;
      });

      const totalDebit = accounts.reduce((sum, acc) => sum + acc.debit, 0);
      const totalCredit = accounts.reduce((sum, acc) => sum + acc.credit, 0);

      const totalClosingDebit = totalOpeningDebit + totalDebit;
      const totalClosingCredit = totalOpeningCredit + totalCredit;
      // Balance = Credit - Debit (negative when debit > credit, positive when credit > debit)
      const totalOpeningBalance = totalOpeningCredit - totalOpeningDebit;
      const totalClosingBalance = totalClosingCredit - totalClosingDebit;

      const retainedEarningsRevenueCredit = accounts
        .filter((acc) => acc.accountName === 'Sales Revenue')
        .reduce((sum, acc) => sum + acc.credit, 0);
      const retainedEarningsRevenueDebit = accounts
        .filter((acc) => acc.accountName === 'Sales Revenue')
        .reduce((sum, acc) => sum + acc.debit, 0);
      const retainedEarningsNetRevenue =
        retainedEarningsRevenueCredit - retainedEarningsRevenueDebit;

      const totalExpensesDebit = accounts
        .filter((acc) => acc.accountType === 'Expense')
        .reduce((sum, acc) => sum + acc.debit, 0);
      const totalExpensesCredit = accounts
        .filter((acc) => acc.accountType === 'Expense')
        .reduce((sum, acc) => sum + acc.credit, 0);
      const netExpenses = totalExpensesDebit - totalExpensesCredit; // Supplier debit notes reduce expenses

      const equityJournalCredit = accounts
        .filter((acc) => acc.accountName.includes('Equity'))
        .reduce((sum, acc) => {
          if (
            acc.accountName.includes('share_capital') ||
            acc.accountName.includes('retained_earnings')
          ) {
            return sum + acc.credit;
          }
          return sum;
        }, 0);
      const equityJournalDebit = accounts
        .filter((acc) => acc.accountName.includes('Equity'))
        .reduce((sum, acc) => {
          if (acc.accountName.includes('shareholder_account')) {
            return sum + acc.debit;
          }
          return sum;
        }, 0);
      const netEquityJournal = equityJournalCredit - equityJournalDebit;

      // Supplier debit notes reduce expenses, which increases retained earnings
      const retainedEarningsBalance =
        retainedEarningsNetRevenue - netExpenses + netEquityJournal;

      accounts.push({
        accountName: 'Retained Earnings / Current Year Profit',
        accountType: 'Equity',
        debit:
          retainedEarningsBalance < 0 ? Math.abs(retainedEarningsBalance) : 0,
        credit: retainedEarningsBalance > 0 ? retainedEarningsBalance : 0,
        balance: retainedEarningsBalance,
      });

      const calculatedRetainedEarnings = totalClosingBalance;
      const accountingDifference =
        calculatedRetainedEarnings - retainedEarningsBalance;

      const finalTotalDebit = accounts.reduce((sum, acc) => sum + acc.debit, 0);
      const finalTotalCredit = accounts.reduce(
        (sum, acc) => sum + acc.credit,
        0,
      );

      const periodDifference = Math.abs(totalDebit - totalCredit);
      const closingDifference = Math.abs(finalTotalDebit - finalTotalCredit);
      const isBalanced = periodDifference < 0.01 && closingDifference < 0.01;

      const accountNamesSet = new Set(accounts.map((acc) => acc.accountName));
      openingBalances.forEach((opening, accountName) => {
        if (
          !accountNamesSet.has(accountName) &&
          (opening.debit > 0 || opening.credit > 0 || opening.balance !== 0)
        ) {
          let accountType = 'Asset';
          if (
            accountName === 'Accounts Payable' ||
            accountName.includes('VAT Payable')
          ) {
            accountType = 'Liability';
          } else if (accountName === 'Sales Revenue') {
            accountType = 'Revenue';
          } else if (accountName.includes('Equity')) {
            accountType = 'Equity';
          }

          accounts.push({
            accountName,
            accountType,
            debit: 0,
            credit: 0,
            balance: 0,
          });
        }
      });

      const accountsWithBalances = accounts.map((acc) => {
        const opening = openingBalances.get(acc.accountName) || {
          debit: 0,
          credit: 0,
          balance: 0,
        };
        const closingDebit = opening.debit + acc.debit;
        const closingCredit = opening.credit + acc.credit;

        const isCreditAccount =
          acc.accountType === 'Liability' ||
          acc.accountType === 'Revenue' ||
          acc.accountType === 'Equity';
        const closingBalance = isCreditAccount
          ? closingCredit - closingDebit
          : closingDebit - closingCredit;

        return {
          ...acc,
          openingDebit: opening.debit,
          openingCredit: opening.credit,
          openingBalance: opening.balance,
          closingDebit: closingDebit,
          closingCredit: closingCredit,
          closingBalance: closingBalance,
        };
      });

      this.logger.debug(
        `Trial Balance calculations complete: accounts=${accountsWithBalances.length}, organizationId=${organizationId}`,
      );

      const result = {
        period: {
          startDate,
          endDate,
        },
        accounts: accountsWithBalances.sort((a, b) => {
          const typeOrder = [
            'Asset',
            'Liability',
            'Expense',
            'Revenue',
            'Journal Entry',
            'Equity',
          ];
          const aTypeIndex = typeOrder.indexOf(a.accountType);
          const bTypeIndex = typeOrder.indexOf(b.accountType);
          const aOrder = aTypeIndex >= 0 ? aTypeIndex : 999;
          const bOrder = bTypeIndex >= 0 ? bTypeIndex : 999;
          if (aOrder !== bOrder) {
            return aOrder - bOrder;
          }
          return a.accountName.localeCompare(b.accountName);
        }),
        summary: {
          openingDebit: Number(totalOpeningDebit.toFixed(2)),
          openingCredit: Number(totalOpeningCredit.toFixed(2)),
          openingBalance: Number(totalOpeningBalance.toFixed(2)),
          periodDebit: Number(totalDebit.toFixed(2)),
          periodCredit: Number(totalCredit.toFixed(2)),
          periodBalance: Number((totalCredit - totalDebit).toFixed(2)),
          closingDebit: Number(totalClosingDebit.toFixed(2)),
          closingCredit: Number(totalClosingCredit.toFixed(2)),
          closingBalance: Number(totalClosingBalance.toFixed(2)),

          totalDebit: Number(totalDebit.toFixed(2)),
          totalCredit: Number(totalCredit.toFixed(2)),
          totalBalance: Number((totalCredit - totalDebit).toFixed(2)),
          accountCount: accounts.length,

          retainedEarnings: Number(retainedEarningsBalance.toFixed(2)),
          netRevenue: Number(retainedEarningsNetRevenue.toFixed(2)),
          totalExpenses: Number(totalExpensesDebit.toFixed(2)),
          netEquityJournal: Number(netEquityJournal.toFixed(2)),

          accountingDifference: Number(accountingDifference.toFixed(2)),

          isBalanced: isBalanced,
          periodDifference: Number(periodDifference.toFixed(2)),
          closingDifference: Number(closingDifference.toFixed(2)),
          warning: !isBalanced
            ? `Trial balance is not balanced! Period difference: ${periodDifference.toFixed(2)}, Closing difference: ${closingDifference.toFixed(2)}. Accounting difference: ${accountingDifference.toFixed(2)}. This indicates an accounting error that needs investigation.`
            : Math.abs(accountingDifference) > 0.01
              ? `Accounting difference detected: ${accountingDifference.toFixed(2)}. This may indicate missing accounts or calculation errors.`
              : null,
        },
      };

      this.logger.log(
        `Trial Balance built successfully: accounts=${result.accounts.length}, isBalanced=${result.summary.isBalanced}, organizationId=${organizationId}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Error building Trial Balance: organizationId=${organizationId}, error=${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async buildBalanceSheet(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    this.logger.log(
      `Building Balance Sheet: organizationId=${organizationId}, filters=${JSON.stringify(filters)}`,
    );
    try {
      const asOfDate =
        filters?.['endDate'] || new Date().toISOString().split('T')[0];
      const startDate =
        filters?.['startDate'] ||
        new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
      this.logger.debug(
        `Balance Sheet date range: startDate=${startDate}, asOfDate=${asOfDate}, organizationId=${organizationId}`,
      );

      const assets: Array<{ category: string; amount: number }> = [];
      let totalAssets = 0;

      const creditNoteApplicationsSubquery =
        this.creditNoteApplicationsRepository
          .createQueryBuilder('cna')
          .select('COALESCE(SUM(cna.appliedAmount), 0)')
          .where('cna.invoice_id = invoice.id')
          .andWhere('cna.organization_id = :organizationId', { organizationId })
          .getQuery();

      const receivablesQuery = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select([
          "'Accounts Receivable' AS category",
          `SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0) - (${creditNoteApplicationsSubquery})) AS amount`,
        ])
        .where('invoice.organization_id = :organizationId', { organizationId })
        .andWhere('invoice.invoice_date <= :asOfDate', { asOfDate })
        .andWhere('invoice.payment_status IN (:...statuses)', {
          statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
        })
        .setParameter('organizationId', organizationId);

      const receivablesDebitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select(['SUM(COALESCE(debitNote.total_amount, 0)) AS debit'])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.debit_note_date <= :asOfDate', { asOfDate })
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        });

      const [receivablesRow, receivablesDebitNotesRow] = await Promise.all([
        receivablesQuery.getRawOne(),
        receivablesDebitNotesQuery.getRawOne(),
      ]);

      const receivablesAmount = Number(receivablesRow?.amount || 0);
      const receivablesDebitNotes = Number(
        receivablesDebitNotesRow?.debit || 0,
      );

      const netReceivablesAmount = receivablesAmount + receivablesDebitNotes;
      this.logger.debug(
        `Receivables calculated: amount=${receivablesAmount}, debitNotes=${receivablesDebitNotes}, net=${netReceivablesAmount}, organizationId=${organizationId}`,
      );
      if (netReceivablesAmount > 0) {
        assets.push({
          category: 'Accounts Receivable',
          amount: netReceivablesAmount,
        });
        totalAssets += netReceivablesAmount;
      }

      // Separate cash and bank payments for balance sheet
      const invoicePaymentsQuery = this.invoicePaymentsRepository
        .createQueryBuilder('payment')
        .select([
          "SUM(CASE WHEN payment.payment_method = 'cash' THEN COALESCE(payment.amount, 0) ELSE 0 END) AS cashReceipts",
          "SUM(CASE WHEN payment.payment_method = 'bank_transfer' THEN COALESCE(payment.amount, 0) ELSE 0 END) AS bankReceipts",
          "SUM(CASE WHEN payment.payment_method NOT IN ('cash', 'bank_transfer') OR payment.payment_method IS NULL THEN COALESCE(payment.amount, 0) ELSE 0 END) AS otherReceipts",
        ])
        .where('payment.organization_id = :organizationId', { organizationId })
        .andWhere('payment.is_deleted = false')
        .andWhere('payment.deleted_at IS NULL')
        .andWhere('payment.payment_date <= :asOfDate', { asOfDate });

      const expensePaymentsQuery = this.expensePaymentsRepository
        .createQueryBuilder('payment')
        .select([
          `SUM(CASE WHEN payment.payment_method = '${PaymentMethod.CASH}' THEN COALESCE(payment.amount, 0) ELSE 0 END) AS cashPayments`,
          `SUM(CASE WHEN payment.payment_method = '${PaymentMethod.BANK_TRANSFER}' THEN COALESCE(payment.amount, 0) ELSE 0 END) AS bankPayments`,
          `SUM(CASE WHEN payment.payment_method NOT IN ('${PaymentMethod.CASH}', '${PaymentMethod.BANK_TRANSFER}') OR payment.payment_method IS NULL THEN COALESCE(payment.amount, 0) ELSE 0 END) AS otherPayments`,
        ])
        .where('payment.organization_id = :organizationId', { organizationId })
        .andWhere('payment.is_deleted = false')
        .andWhere('payment.deleted_at IS NULL')
        .andWhere('payment.payment_date <= :asOfDate', { asOfDate });

      // Query journal entries for Cash separately
      const cashJournalEntriesQuery = this.journalEntriesRepository
        .createQueryBuilder('entry')
        .select([
          "SUM(CASE WHEN entry.debit_account = 'cash' THEN entry.amount ELSE 0 END) AS received",
          "SUM(CASE WHEN entry.credit_account = 'cash' THEN entry.amount ELSE 0 END) AS paid",
        ])
        .where('entry.organization_id = :organizationId', { organizationId })
        .andWhere('entry.entry_date <= :asOfDate', { asOfDate })
        .andWhere(
          "(entry.debit_account = 'cash' OR entry.credit_account = 'cash')",
        );

      // Query journal entries for Bank separately
      const bankJournalEntriesQuery = this.journalEntriesRepository
        .createQueryBuilder('entry')
        .select([
          "SUM(CASE WHEN entry.debit_account = 'bank' THEN entry.amount ELSE 0 END) AS received",
          "SUM(CASE WHEN entry.credit_account = 'bank' THEN entry.amount ELSE 0 END) AS paid",
        ])
        .where('entry.organization_id = :organizationId', { organizationId })
        .andWhere('entry.entry_date <= :asOfDate', { asOfDate })
        .andWhere(
          "(entry.debit_account = 'bank' OR entry.credit_account = 'bank')",
        );

      const [
        invoicePaymentsRow,
        expensePaymentsRow,
        cashJournalEntriesRow,
        bankJournalEntriesRow,
      ] = await Promise.all([
        invoicePaymentsQuery.getRawOne(),
        expensePaymentsQuery.getRawOne(),
        cashJournalEntriesQuery.getRawOne(),
        bankJournalEntriesQuery.getRawOne(),
      ]);

      // Calculate Cash and Bank separately
      // Fix case sensitivity for Balance Sheet cash/bank fields
      const totalCashReceipts = Number(
        invoicePaymentsRow?.cashreceipts ||
          invoicePaymentsRow?.cashReceipts ||
          0,
      );
      const totalCashPayments = Number(
        expensePaymentsRow?.cashpayments ||
          expensePaymentsRow?.cashPayments ||
          0,
      );
      const totalBankReceipts = Number(
        invoicePaymentsRow?.bankreceipts ||
          invoicePaymentsRow?.bankReceipts ||
          0,
      );
      const totalBankPayments = Number(
        expensePaymentsRow?.bankpayments ||
          expensePaymentsRow?.bankPayments ||
          0,
      );
      // Journal entries for cash (no splitting)
      const totalCashJournalReceived = Number(
        cashJournalEntriesRow?.received || 0,
      );
      const totalCashJournalPaid = Number(cashJournalEntriesRow?.paid || 0);
      // Journal entries for bank (no splitting)
      const totalBankJournalReceived = Number(
        bankJournalEntriesRow?.received || 0,
      );
      const totalBankJournalPaid = Number(bankJournalEntriesRow?.paid || 0);

      // Debug logging for cash calculation
      this.logger.debug(
        `Balance Sheet Cash Calculation: receipts=${totalCashReceipts}, payments=${totalCashPayments}, ` +
          `journalReceived=${totalCashJournalReceived}, journalPaid=${totalCashJournalPaid}, ` +
          `netCash=${totalCashReceipts - totalCashPayments + totalCashJournalReceived - totalCashJournalPaid}, ` +
          `organizationId=${organizationId}, asOfDate=${asOfDate}`,
      );

      const netCash =
        totalCashReceipts -
        totalCashPayments +
        totalCashJournalReceived -
        totalCashJournalPaid;
      const netBank =
        totalBankReceipts -
        totalBankPayments +
        totalBankJournalReceived -
        totalBankJournalPaid;

      // Add Cash to assets (can be negative to reduce total assets)
      if (netCash !== 0) {
        assets.push({
          category: 'Cash',
          amount: netCash, // Can be negative
        });
        totalAssets += netCash; // Negative cash reduces total assets
      }

      // Add Bank to assets (can be negative to reduce total assets)
      if (netBank !== 0) {
        assets.push({
          category: 'Bank',
          amount: netBank, // Can be negative
        });
        totalAssets += netBank; // Negative bank reduces total assets
      }

      const vatReceivableQuery = this.expensesRepository
        .createQueryBuilder('expense')
        .select([
          "'VAT Receivable (Input VAT)' AS category",
          'SUM(COALESCE(expense.vat_amount, 0)) AS amount',
        ])
        .where('expense.organization_id = :organizationId', { organizationId })
        .andWhere('expense.is_deleted = false')
        .andWhere('expense.expense_date <= :asOfDate', { asOfDate })
        .andWhere('expense.vat_amount > 0')
        .andWhere("(expense.type IS NULL OR expense.type != 'credit')");

      if (filters?.['type']) {
        const types = Array.isArray(filters.type)
          ? filters.type
          : [filters.type];
        vatReceivableQuery.andWhere('expense.type IN (:...types)', { types });
      }

      const vatReceivableRow = await vatReceivableQuery.getRawOne();
      const vatReceivableAmount = Number(vatReceivableRow?.amount || 0);
      if (vatReceivableAmount > 0) {
        assets.push({
          category: 'VAT Receivable (Input VAT)',
          amount: vatReceivableAmount,
        });
        totalAssets += vatReceivableAmount;
      }

      // Calculate Closing Stock (Inventory)
      const closingStockValue = await this.calculateClosingStock(
        organizationId,
        asOfDate,
      );
      if (closingStockValue > 0) {
        assets.push({
          category: 'Closing Stock (Inventory)',
          amount: closingStockValue,
        });
        totalAssets += closingStockValue;
        this.logger.debug(
          `Closing stock added to Balance Sheet: ${closingStockValue}, organizationId=${organizationId}`,
        );
      }

      const liabilities: Array<{
        vendor: string;
        amount: number;
        status: string;
        category?: string;
      }> = [];
      let totalLiabilities = 0;

      // Calculate Accounts Payable based on unpaid expenses linked to accruals
      // Outstanding = expense.total_amount - payments - debit_note_applications
      const expensePaymentsSubquery = this.expensePaymentsRepository
        .createQueryBuilder('payment')
        .select('COALESCE(SUM(payment.amount), 0)')
        .where('payment.expense_id = expense.id')
        .andWhere('payment.payment_date <= :asOfDate')
        .andWhere('payment.organization_id = :organizationId')
        .andWhere('payment.is_deleted = false')
        .getQuery();

      const debitNoteExpenseApplicationsSubquery =
        this.debitNoteExpenseApplicationsRepository
          .createQueryBuilder('dnea')
          .select('COALESCE(SUM(dnea.appliedAmount), 0)')
          .where('dnea.expense_id = expense.id')
          .andWhere('dnea.organization_id = :organizationId')
          .getQuery();

      const accrualsQuery = this.accrualsRepository
        .createQueryBuilder('accrual')
        .leftJoin('accrual.expense', 'expense')
        .select([
          'accrual.vendor_name AS vendor',
          'expense.id AS expenseId',
          'expense.total_amount AS expenseTotalAmount',
          `(${expensePaymentsSubquery}) AS paidAmount`,
          `(${debitNoteExpenseApplicationsSubquery}) AS debitNoteAppliedAmount`,
        ])
        .where('accrual.organization_id = :organizationId', { organizationId })
        .andWhere('accrual.is_deleted = false')
        .andWhere('expense.is_deleted = false')
        .andWhere('accrual.created_at::date <= :asOfDate', { asOfDate })
        .setParameter('organizationId', organizationId)
        .setParameter('asOfDate', asOfDate);

      const accrualsRows = await accrualsQuery.getRawMany();

      // Group by vendor and calculate outstanding amounts
      const vendorPayables = new Map<string, number>();

      accrualsRows.forEach((row) => {
        const expenseTotal = Number(
          row.expenseTotalAmount || row.expensetotalamount || 0,
        );
        const paidAmount = Number(row.paidAmount || row.paidamount || 0);
        const debitNoteApplied = Number(
          row.debitnoteappliedamount || row.debitNoteAppliedAmount || 0,
        );
        const outstanding = expenseTotal - paidAmount - debitNoteApplied;

        if (outstanding > 0) {
          const vendor = row.vendor || 'N/A';
          const currentAmount = vendorPayables.get(vendor) || 0;
          vendorPayables.set(vendor, currentAmount + outstanding);
        }
      });

      // Add to liabilities
      vendorPayables.forEach((amount, vendor) => {
        if (amount > 0) {
          liabilities.push({
            vendor,
            amount,
            status: 'Unpaid',
            category: 'Accounts Payable',
          });
          totalLiabilities += amount;
        }
      });

      const vatPayableQuery = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select([
          "'VAT Payable (Output VAT)' AS category",
          'SUM(COALESCE(invoice.vat_amount, 0)) AS amount',
        ])
        .where('invoice.organization_id = :organizationId', { organizationId })
        .andWhere('invoice.invoice_date <= :asOfDate', { asOfDate })
        .andWhere('invoice.vat_amount > 0');

      if (filters?.['status']) {
        const statuses = Array.isArray(filters.status)
          ? filters.status
          : [filters.status];
        vatPayableQuery.andWhere('invoice.status IN (:...statuses)', {
          statuses,
        });
      }

      const vatCreditNotesQuery = this.creditNotesRepository
        .createQueryBuilder('creditNote')
        .select(['SUM(COALESCE(creditNote.vat_amount, 0)) AS vat'])
        .where('creditNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('creditNote.credit_note_date <= :asOfDate', { asOfDate })
        .andWhere('creditNote.status IN (:...statuses)', {
          statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
        })
        .andWhere('creditNote.vat_amount > 0');

      const vatDebitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select(['SUM(COALESCE(debitNote.vat_amount, 0)) AS vat'])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.debit_note_date <= :asOfDate', { asOfDate })
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        })
        .andWhere('debitNote.vat_amount > 0');

      const [vatPayableRow, vatCreditNotesRow, vatDebitNotesRow] =
        await Promise.all([
          vatPayableQuery.getRawOne(),
          vatCreditNotesQuery.getRawOne(),
          vatDebitNotesQuery.getRawOne(),
        ]);

      const vatPayableAmount = Number(vatPayableRow?.amount || 0);
      const vatCreditNotesAmount = Number(vatCreditNotesRow?.vat || 0);
      const vatDebitNotesAmount = Number(vatDebitNotesRow?.vat || 0);

      const netVatPayableAmount =
        vatPayableAmount - vatCreditNotesAmount + vatDebitNotesAmount;
      if (netVatPayableAmount > 0) {
        liabilities.push({
          vendor: 'VAT Payable (Output VAT)',
          amount: netVatPayableAmount,
          status: 'Liability',
        });
        totalLiabilities += netVatPayableAmount;
      }

      const revenueQuery = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select([
          'SUM(COALESCE(invoice.base_amount, invoice.amount)) AS revenue',
        ])
        .where('invoice.organization_id = :organizationId', { organizationId })
        .andWhere('invoice.invoice_date <= :asOfDate', { asOfDate });

      // Include credit notes that have applications, even if in DRAFT status
      const balanceSheetCreditNotesWithApplicationsSubquery =
        this.creditNoteApplicationsRepository
          .createQueryBuilder('cna')
          .select('DISTINCT cna.credit_note_id')
          .where('cna.organization_id = :organizationId', { organizationId })
          .getQuery();

      const creditNotesQuery = this.creditNotesRepository
        .createQueryBuilder('creditNote')
        .select([
          'SUM(COALESCE(creditNote.base_amount, creditNote.amount)) AS creditNotes',
        ])
        .where('creditNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('creditNote.credit_note_date <= :asOfDate', { asOfDate })
        .andWhere(
          '(creditNote.status IN (:...statuses) OR creditNote.id IN (' +
            balanceSheetCreditNotesWithApplicationsSubquery +
            '))',
          {
            statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
          },
        );

      const debitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select([
          'SUM(COALESCE(debitNote.base_amount, debitNote.amount)) AS debitNotes',
        ])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.debit_note_date <= :asOfDate', { asOfDate })
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        });

      const journalEntriesQuery = this.journalEntriesRepository
        .createQueryBuilder('entry')
        .select([
          'entry.debit_account AS debitAccount',
          'entry.credit_account AS creditAccount',
          'SUM(entry.amount) AS amount',
        ])
        .where('entry.organization_id = :organizationId', { organizationId })
        .andWhere('entry.entry_date <= :asOfDate', { asOfDate })
        .andWhere("entry.debit_account NOT IN ('cash', 'bank')")
        .andWhere("entry.credit_account NOT IN ('cash', 'bank')")
        .groupBy('entry.debit_account')
        .addGroupBy('entry.credit_account');

      // Separate query for equity accounts to include entries even when debit is Cash/Bank
      // This ensures Share Capital entries are captured even if they're debited to Cash/Bank
      // Only query entries where debit is Cash/Bank (since main query excludes these)
      const equityAccountsQuery = this.journalEntriesRepository
        .createQueryBuilder('entry')
        .select([
          'entry.debit_account AS debitAccount',
          'entry.credit_account AS creditAccount',
          'SUM(entry.amount) AS amount',
        ])
        .where('entry.organization_id = :organizationId', { organizationId })
        .andWhere('entry.entry_date <= :asOfDate', { asOfDate })
        .andWhere(
          "entry.credit_account IN ('share_capital', 'retained_earnings', 'owner_shareholder_account')",
        )
        .andWhere("entry.debit_account IN ('cash', 'bank')")
        .groupBy('entry.debit_account')
        .addGroupBy('entry.credit_account');

      const [
        revenueRow,
        creditNotesRow,
        debitNotesRow,
        journalRows,
        equityRows,
      ] = await Promise.all([
        revenueQuery.getRawOne(),
        creditNotesQuery.getRawOne(),
        debitNotesQuery.getRawOne(),
        journalEntriesQuery.getRawMany(),
        equityAccountsQuery.getRawMany(),
      ]);

      const totalRevenue = Number(revenueRow?.revenue || 0);
      const creditNotesAmount = Number(creditNotesRow?.creditNotes || 0);
      const debitNotesAmount = Number(debitNotesRow?.debitNotes || 0);

      // Aggregate journal entries by account
      // For each account, calculate balance based on account type:
      // - Assets/Expenses: Debit increases, Credit decreases → Balance = Debits - Credits
      // - Liabilities/Equity/Revenue: Credit increases, Debit decreases → Balance = Credits - Debits
      const accountAmounts = new Map<JournalEntryAccount, number>();
      const accountDebits = new Map<JournalEntryAccount, number>();
      const accountCredits = new Map<JournalEntryAccount, number>();

      journalRows.forEach((row) => {
        const amount = Number(row.amount || 0);
        const debitAccount = row.debitaccount || row.debitAccount;
        const creditAccount = row.creditaccount || row.creditAccount;

        // Track debits and credits separately
        if (debitAccount) {
          const existing =
            accountDebits.get(debitAccount as JournalEntryAccount) || 0;
          accountDebits.set(
            debitAccount as JournalEntryAccount,
            existing + amount,
          );
        }
        if (creditAccount) {
          const existing =
            accountCredits.get(creditAccount as JournalEntryAccount) || 0;
          accountCredits.set(
            creditAccount as JournalEntryAccount,
            existing + amount,
          );
        }
      });

      // Add equity account entries (including those with Cash/Bank as debit)
      // This ensures Share Capital entries are captured even when debited to Cash/Bank
      equityRows.forEach((row) => {
        const amount = Number(row.amount || 0);
        const debitAccount = row.debitaccount || row.debitAccount;
        const creditAccount = row.creditaccount || row.creditAccount;

        // Only process if credit account is an equity account
        if (
          creditAccount &&
          [
            'share_capital',
            'retained_earnings',
            'owner_shareholder_account',
          ].includes(creditAccount)
        ) {
          // Track debits (even if to Cash/Bank) for equity accounts
          if (debitAccount) {
            const existing =
              accountDebits.get(debitAccount as JournalEntryAccount) || 0;
            accountDebits.set(
              debitAccount as JournalEntryAccount,
              existing + amount,
            );
          }
          // Track credits for equity accounts
          const existing =
            accountCredits.get(creditAccount as JournalEntryAccount) || 0;
          accountCredits.set(
            creditAccount as JournalEntryAccount,
            existing + amount,
          );
        }
      });

      // Calculate balance for each account based on account type
      Object.values(JournalEntryAccount).forEach((account) => {
        const debits = accountDebits.get(account) || 0;
        const credits = accountCredits.get(account) || 0;
        const category = ACCOUNT_METADATA[account]?.category || 'asset';

        // Calculate balance based on account category
        let balance = 0;
        if (category === 'asset' || category === 'expense') {
          // Assets and Expenses: Debit increases, Credit decreases
          balance = debits - credits;
        } else {
          // Liabilities, Equity, Revenue: Credit increases, Debit decreases
          balance = credits - debits;
        }

        accountAmounts.set(account, balance);
      });

      // Extract specific account balances for equity calculation
      // Note: accountAmounts contains ALL entries up to asOfDate, not just period entries
      const totalJournalEquity =
        (accountAmounts.get(JournalEntryAccount.SHARE_CAPITAL) || 0) +
        (accountAmounts.get(JournalEntryAccount.RETAINED_EARNINGS) || 0);
      const totalJournalShareholder =
        accountAmounts.get(JournalEntryAccount.OWNER_SHAREHOLDER_ACCOUNT) || 0;
      const totalJournalPrepaid =
        accountAmounts.get(JournalEntryAccount.PREPAID_EXPENSES) || 0;
      const totalJournalAccruedIncome =
        accountAmounts.get(JournalEntryAccount.ACCOUNTS_RECEIVABLE) || 0;
      const totalJournalDepreciation =
        accountAmounts.get(JournalEntryAccount.GENERAL_EXPENSE) || 0;
      const totalJournalOutstanding =
        accountAmounts.get(JournalEntryAccount.ACCOUNTS_PAYABLE) || 0;

      // Create equity map for compatibility with existing code
      const journalEquityMap = new Map<string, number>();
      journalEquityMap.set(
        'share_capital',
        accountAmounts.get(JournalEntryAccount.SHARE_CAPITAL) || 0,
      );
      journalEquityMap.set(
        'retained_earnings',
        accountAmounts.get(JournalEntryAccount.RETAINED_EARNINGS) || 0,
      );
      journalEquityMap.set('shareholder_account', totalJournalShareholder);

      const netRevenue = totalRevenue - creditNotesAmount + debitNotesAmount;

      const expensesQuery = this.expensesRepository
        .createQueryBuilder('expense')
        .select([
          'SUM(COALESCE(expense.base_amount, expense.amount)) AS amount',
        ])
        .where('expense.organization_id = :organizationId', { organizationId })
        .andWhere('expense.is_deleted = false')
        .andWhere('expense.expense_date <= :asOfDate', { asOfDate })
        .andWhere("(expense.type IS NULL OR expense.type != 'credit')");

      if (filters?.['type']) {
        const types = Array.isArray(filters.type)
          ? filters.type
          : [filters.type];
        expensesQuery.andWhere('expense.type IN (:...types)', { types });
      }

      const expensesRow = await expensesQuery.getRawOne();
      const totalExpenses = Number(expensesRow?.amount || 0);

      // Calculate period journal amounts for assets (period = total - opening)
      // Note: We'll calculate period amounts for equity after we get opening amounts
      const journalPrepaid = totalJournalPrepaid;
      const journalAccruedIncome = totalJournalAccruedIncome;

      if (journalPrepaid > 0) {
        assets.push({
          category: 'Prepaid Expenses',
          amount: journalPrepaid,
        });
        totalAssets += journalPrepaid;
      }
      if (journalAccruedIncome > 0) {
        assets.push({
          category: 'Accrued Income',
          amount: journalAccruedIncome,
        });
        totalAssets += journalAccruedIncome;
      }

      // totalEquity will be recalculated after we get opening amounts
      // It's calculated later with period amounts (see line 2397)

      const openingExpensesQuery = this.expensesRepository
        .createQueryBuilder('expense')
        .select([
          'SUM(COALESCE(expense.base_amount, expense.amount)) AS amount',
        ])
        .where('expense.organization_id = :organizationId', { organizationId })
        .andWhere('expense.is_deleted = false')
        .andWhere('expense.expense_date < :startDate', { startDate })
        .andWhere("(expense.type IS NULL OR expense.type != 'credit')");

      const openingCreditNoteApplicationsSubquery =
        this.creditNoteApplicationsRepository
          .createQueryBuilder('cna')
          .select('COALESCE(SUM(cna.appliedAmount), 0)')
          .where('cna.invoice_id = invoice.id')
          .andWhere('cna.organization_id = :organizationId', { organizationId })
          .getQuery();

      const openingReceivablesQuery = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select([
          `SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0) - (${openingCreditNoteApplicationsSubquery})) AS amount`,
        ])
        .where('invoice.organization_id = :organizationId', { organizationId })
        .andWhere('invoice.invoice_date < :startDate', { startDate })
        .andWhere('invoice.payment_status IN (:...statuses)', {
          statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
        })
        .setParameter('organizationId', organizationId);

      // Opening customer debit notes (for accounts receivable in Balance Sheet)
      // Only include debit notes linked to invoices, not expenses
      const openingReceivablesDebitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select(['SUM(COALESCE(debitNote.total_amount, 0)) AS debit'])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.debit_note_date < :startDate', { startDate })
        .andWhere('debitNote.invoice_id IS NOT NULL') // Only customer debit notes
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        });

      // Separate cash and bank payments for balance sheet opening balances
      const openingCashQuery = this.invoicePaymentsRepository
        .createQueryBuilder('payment')
        .select([
          "SUM(CASE WHEN payment.payment_method = 'cash' THEN COALESCE(payment.amount, 0) ELSE 0 END) AS cashReceipts",
          "SUM(CASE WHEN payment.payment_method = 'bank_transfer' THEN COALESCE(payment.amount, 0) ELSE 0 END) AS bankReceipts",
        ])
        .where('payment.organization_id = :organizationId', { organizationId })
        .andWhere('payment.payment_date < :startDate', { startDate });

      const openingExpensePaymentsQuery = this.expensePaymentsRepository
        .createQueryBuilder('payment')
        .select([
          `SUM(CASE WHEN payment.payment_method = '${PaymentMethod.CASH}' THEN COALESCE(payment.amount, 0) ELSE 0 END) AS cashPayments`,
          `SUM(CASE WHEN payment.payment_method = '${PaymentMethod.BANK_TRANSFER}' THEN COALESCE(payment.amount, 0) ELSE 0 END) AS bankPayments`,
        ])
        .where('payment.organization_id = :organizationId', { organizationId })
        .andWhere('payment.is_deleted = false')
        .andWhere('payment.deleted_at IS NULL')
        .andWhere('payment.payment_date < :startDate', { startDate });

      // Query journal entries for Cash separately (opening - balance sheet)
      const openingCashJournalEntriesQuery = this.journalEntriesRepository
        .createQueryBuilder('entry')
        .select([
          "SUM(CASE WHEN entry.debit_account = 'cash' THEN entry.amount ELSE 0 END) AS received",
          "SUM(CASE WHEN entry.credit_account = 'cash' THEN entry.amount ELSE 0 END) AS paid",
        ])
        .where('entry.organization_id = :organizationId', { organizationId })
        .andWhere('entry.entry_date < :startDate', { startDate })
        .andWhere(
          "(entry.debit_account = 'cash' OR entry.credit_account = 'cash')",
        );

      // Query journal entries for Bank separately (opening - balance sheet)
      const openingBankJournalEntriesQuery = this.journalEntriesRepository
        .createQueryBuilder('entry')
        .select([
          "SUM(CASE WHEN entry.debit_account = 'bank' THEN entry.amount ELSE 0 END) AS received",
          "SUM(CASE WHEN entry.credit_account = 'bank' THEN entry.amount ELSE 0 END) AS paid",
        ])
        .where('entry.organization_id = :organizationId', { organizationId })
        .andWhere('entry.entry_date < :startDate', { startDate })
        .andWhere(
          "(entry.debit_account = 'bank' OR entry.credit_account = 'bank')",
        );

      const openingVatReceivableQuery = this.expensesRepository
        .createQueryBuilder('expense')
        .select(['SUM(COALESCE(expense.vat_amount, 0)) AS amount'])
        .where('expense.organization_id = :organizationId', { organizationId })
        .andWhere('expense.is_deleted = false')
        .andWhere('expense.expense_date < :startDate', { startDate })
        .andWhere('expense.vat_amount > 0')
        .andWhere("(expense.type IS NULL OR expense.type != 'credit')");

      const openingAccrualsQuery = this.accrualsRepository
        .createQueryBuilder('accrual')
        .select(['SUM(accrual.amount) AS amount'])
        .where('accrual.organization_id = :organizationId', { organizationId })
        .andWhere('accrual.is_deleted = false')
        .andWhere('accrual.status = :status', {
          status: AccrualStatus.PENDING_SETTLEMENT,
        })
        .andWhere('accrual.created_at::date < :startDate', { startDate });

      const openingVatPayableQuery = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select(['SUM(COALESCE(invoice.vat_amount, 0)) AS amount'])
        .where('invoice.organization_id = :organizationId', { organizationId })
        .andWhere('invoice.invoice_date < :startDate', { startDate })
        .andWhere('invoice.vat_amount > 0');

      const openingRevenueQuery = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select([
          'SUM(COALESCE(invoice.base_amount, invoice.amount)) AS revenue',
        ])
        .where('invoice.organization_id = :organizationId', { organizationId })
        .andWhere('invoice.invoice_date < :startDate', { startDate });

      // Include opening credit notes that have applications, even if in DRAFT status
      const pnlOpeningCreditNotesWithApplicationsSubquery =
        this.creditNoteApplicationsRepository
          .createQueryBuilder('cna')
          .select('DISTINCT cna.credit_note_id')
          .where('cna.organization_id = :organizationId', { organizationId })
          .getQuery();

      const openingCreditNotesQuery = this.creditNotesRepository
        .createQueryBuilder('creditNote')
        .select([
          'SUM(COALESCE(creditNote.base_amount, creditNote.amount)) AS credit',
        ])
        .where('creditNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('creditNote.credit_note_date < :startDate', { startDate })
        .andWhere(
          '(creditNote.status IN (:...statuses) OR creditNote.id IN (' +
            pnlOpeningCreditNotesWithApplicationsSubquery +
            '))',
          {
            statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
          },
        );

      // Opening customer debit notes (for revenue in P&L)
      // Only include debit notes linked to invoices, not expenses
      const openingDebitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select([
          'SUM(COALESCE(debitNote.base_amount, debitNote.amount)) AS debit',
        ])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.debit_note_date < :startDate', { startDate })
        .andWhere('debitNote.invoice_id IS NOT NULL') // Only customer debit notes
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        });

      const openingJournalQuery = this.journalEntriesRepository
        .createQueryBuilder('entry')
        .select([
          'entry.debit_account AS debitAccount',
          'entry.credit_account AS creditAccount',
          'SUM(entry.amount) AS amount',
        ])
        .where('entry.organization_id = :organizationId', { organizationId })
        .andWhere('entry.entry_date < :startDate', { startDate })
        .andWhere("entry.debit_account NOT IN ('cash', 'bank')")
        .andWhere("entry.credit_account NOT IN ('cash', 'bank')")
        .groupBy('entry.debit_account')
        .addGroupBy('entry.credit_account');

      // Separate query for opening equity accounts to include entries even when debit is Cash/Bank
      // This ensures Share Capital entries are captured even if they're debited to Cash/Bank
      const openingEquityAccountsQuery = this.journalEntriesRepository
        .createQueryBuilder('entry')
        .select([
          'entry.debit_account AS debitAccount',
          'entry.credit_account AS creditAccount',
          'SUM(entry.amount) AS amount',
        ])
        .where('entry.organization_id = :organizationId', { organizationId })
        .andWhere('entry.entry_date < :startDate', { startDate })
        .andWhere(
          "entry.credit_account IN ('share_capital', 'retained_earnings', 'owner_shareholder_account')",
        )
        .andWhere("entry.debit_account IN ('cash', 'bank')")
        .groupBy('entry.debit_account')
        .addGroupBy('entry.credit_account');

      const [
        openingExpensesRow,
        openingReceivablesRow,
        openingReceivablesDebitNotesRow,
        openingCashRow,
        openingExpensePaymentsRow,
        openingVatReceivableRow,
        openingAccrualsRow,
        openingVatPayableRow,
        openingRevenueRow,
        openingCreditNotesRow,
        openingDebitNotesRow,
        openingJournalRows,
        openingEquityRows,
        openingCashJournalEntriesRow,
        openingBankJournalEntriesRow,
      ] = await Promise.all([
        openingExpensesQuery.getRawOne(),
        openingReceivablesQuery.getRawOne(),
        openingReceivablesDebitNotesQuery.getRawOne(),
        openingCashQuery.getRawOne(),
        openingExpensePaymentsQuery.getRawOne(),
        openingVatReceivableQuery.getRawOne(),
        openingAccrualsQuery.getRawOne(),
        openingVatPayableQuery.getRawOne(),
        openingRevenueQuery.getRawOne(),
        openingCreditNotesQuery.getRawOne(),
        openingDebitNotesQuery.getRawOne(),
        openingJournalQuery.getRawMany(),
        openingEquityAccountsQuery.getRawMany(),
        openingCashJournalEntriesQuery.getRawOne(),
        openingBankJournalEntriesQuery.getRawOne(),
      ]);

      const openingExpenses = Number(openingExpensesRow?.amount || 0);
      const openingReceivablesAmount = Number(
        openingReceivablesRow?.amount || 0,
      );
      const openingReceivablesDebitNotes = Number(
        openingReceivablesDebitNotesRow?.debit || 0,
      );

      const openingReceivables =
        openingReceivablesAmount + openingReceivablesDebitNotes;
      // Separate cash and bank for opening balances
      // Fix case sensitivity for Balance Sheet opening balances
      const openingCashReceipts = Number(
        openingCashRow?.cashreceipts || openingCashRow?.cashReceipts || 0,
      );
      const openingCashPayments = Number(
        openingExpensePaymentsRow?.cashpayments ||
          openingExpensePaymentsRow?.cashPayments ||
          0,
      );
      const openingBankReceipts = Number(
        openingCashRow?.bankreceipts || openingCashRow?.bankReceipts || 0,
      );
      const openingBankPayments = Number(
        openingExpensePaymentsRow?.bankpayments ||
          openingExpensePaymentsRow?.bankPayments ||
          0,
      );
      // Journal entries for cash (no splitting)
      const openingCashJournalReceived = Number(
        openingCashJournalEntriesRow?.received || 0,
      );
      const openingCashJournalPaid = Number(
        openingCashJournalEntriesRow?.paid || 0,
      );
      // Journal entries for bank (no splitting)
      const openingBankJournalReceived = Number(
        openingBankJournalEntriesRow?.received || 0,
      );
      const openingBankJournalPaid = Number(
        openingBankJournalEntriesRow?.paid || 0,
      );
      const openingCash =
        openingCashReceipts -
        openingCashPayments +
        openingCashJournalReceived -
        openingCashJournalPaid;
      const openingBank =
        openingBankReceipts -
        openingBankPayments +
        openingBankJournalReceived -
        openingBankJournalPaid;
      const openingVatReceivable = Number(openingVatReceivableRow?.amount || 0);

      // Balance sheet should show CLOSING cash and bank balances separately
      // If positive: show as Cash or Bank asset
      // If negative: show as negative Cash or Bank asset (reduces total assets)
      // This ensures Assets = Liabilities + Equity always balances
      // Remove old Cash/Bank entry if it exists
      const oldCashBankIndex = assets.findIndex(
        (a) => a.category === 'Cash/Bank',
      );
      if (oldCashBankIndex >= 0) {
        const oldCashBankAmount = assets[oldCashBankIndex].amount;
        totalAssets = totalAssets - oldCashBankAmount;
        assets.splice(oldCashBankIndex, 1);
      }

      // Remove existing Cash entry if it exists (to avoid duplicates)
      const existingCashIndex = assets.findIndex((a) => a.category === 'Cash');
      if (existingCashIndex >= 0) {
        const existingCashAmount = assets[existingCashIndex].amount;
        totalAssets = totalAssets - existingCashAmount;
        assets.splice(existingCashIndex, 1);
      }

      // Remove existing Bank entry if it exists (to avoid duplicates)
      const existingBankIndex = assets.findIndex((a) => a.category === 'Bank');
      if (existingBankIndex >= 0) {
        const existingBankAmount = assets[existingBankIndex].amount;
        totalAssets = totalAssets - existingBankAmount;
        assets.splice(existingBankIndex, 1);
      }

      // Add Cash account (only once)
      if (netCash !== 0) {
        assets.push({
          category: 'Cash',
          amount: netCash, // Can be negative
        });
        totalAssets += netCash; // Negative cash reduces total assets
      }

      // Add Bank account (only once)
      if (netBank !== 0) {
        assets.push({
          category: 'Bank',
          amount: netBank, // Can be negative
        });
        totalAssets += netBank; // Negative bank reduces total assets
      }

      const openingAssetsBase =
        openingReceivables + openingCash + openingBank + openingVatReceivable;

      const openingAccruals = Number(openingAccrualsRow?.amount || 0);
      const openingVatPayable = Number(openingVatPayableRow?.amount || 0);

      const openingRevenue = Number(openingRevenueRow?.revenue || 0);
      const openingCreditNotes = Number(openingCreditNotesRow?.credit || 0);
      const openingDebitNotes = Number(openingDebitNotesRow?.debit || 0);
      const openingNetRevenue =
        openingRevenue - openingCreditNotes + openingDebitNotes;

      // Aggregate opening journal entries by account
      // Use same logic as period aggregation: calculate balance based on account type
      const openingAccountAmounts = new Map<JournalEntryAccount, number>();
      const openingAccountDebits = new Map<JournalEntryAccount, number>();
      const openingAccountCredits = new Map<JournalEntryAccount, number>();

      openingJournalRows.forEach((row) => {
        const amount = Number(row.amount || 0);
        const debitAccount = row.debitaccount || row.debitAccount;
        const creditAccount = row.creditaccount || row.creditAccount;

        // Track debits and credits separately
        if (debitAccount) {
          const existing =
            openingAccountDebits.get(debitAccount as JournalEntryAccount) || 0;
          openingAccountDebits.set(
            debitAccount as JournalEntryAccount,
            existing + amount,
          );
        }
        if (creditAccount) {
          const existing =
            openingAccountCredits.get(creditAccount as JournalEntryAccount) ||
            0;
          openingAccountCredits.set(
            creditAccount as JournalEntryAccount,
            existing + amount,
          );
        }
      });

      // Add opening equity account entries (including those with Cash/Bank as debit)
      // This ensures Share Capital entries are captured even when debited to Cash/Bank
      openingEquityRows.forEach((row) => {
        const amount = Number(row.amount || 0);
        const debitAccount = row.debitaccount || row.debitAccount;
        const creditAccount = row.creditaccount || row.creditAccount;

        // Only process if credit account is an equity account
        if (
          creditAccount &&
          [
            'share_capital',
            'retained_earnings',
            'owner_shareholder_account',
          ].includes(creditAccount)
        ) {
          // Track debits (even if to Cash/Bank) for equity accounts
          if (debitAccount) {
            const existing =
              openingAccountDebits.get(debitAccount as JournalEntryAccount) ||
              0;
            openingAccountDebits.set(
              debitAccount as JournalEntryAccount,
              existing + amount,
            );
          }
          // Track credits for equity accounts
          const existing =
            openingAccountCredits.get(creditAccount as JournalEntryAccount) ||
            0;
          openingAccountCredits.set(
            creditAccount as JournalEntryAccount,
            existing + amount,
          );
        }
      });

      // Calculate balance for each account based on account type
      Object.values(JournalEntryAccount).forEach((account) => {
        const debits = openingAccountDebits.get(account) || 0;
        const credits = openingAccountCredits.get(account) || 0;
        const category = ACCOUNT_METADATA[account]?.category || 'asset';

        // Calculate balance based on account category
        let balance = 0;
        if (category === 'asset' || category === 'expense') {
          // Assets and Expenses: Debit increases, Credit decreases
          balance = debits - credits;
        } else {
          // Liabilities, Equity, Revenue: Credit increases, Debit decreases
          balance = credits - debits;
        }

        openingAccountAmounts.set(account, balance);
      });

      // Extract specific account balances
      const openingJournalEquity =
        (openingAccountAmounts.get(JournalEntryAccount.SHARE_CAPITAL) || 0) +
        (openingAccountAmounts.get(JournalEntryAccount.RETAINED_EARNINGS) || 0);
      const openingJournalShareholder =
        openingAccountAmounts.get(
          JournalEntryAccount.OWNER_SHAREHOLDER_ACCOUNT,
        ) || 0;
      const openingJournalPrepaid =
        openingAccountAmounts.get(JournalEntryAccount.PREPAID_EXPENSES) || 0;
      const openingJournalAccruedIncome =
        openingAccountAmounts.get(JournalEntryAccount.ACCOUNTS_RECEIVABLE) || 0;
      const openingJournalDepreciation =
        openingAccountAmounts.get(JournalEntryAccount.GENERAL_EXPENSE) || 0;
      const openingJournalOutstanding =
        openingAccountAmounts.get(JournalEntryAccount.ACCOUNTS_PAYABLE) || 0;

      // Create equity map for compatibility
      const openingJournalEquityMap = new Map<string, number>();
      openingJournalEquityMap.set(
        'share_capital',
        openingAccountAmounts.get(JournalEntryAccount.SHARE_CAPITAL) || 0,
      );
      openingJournalEquityMap.set(
        'retained_earnings',
        openingAccountAmounts.get(JournalEntryAccount.RETAINED_EARNINGS) || 0,
      );
      openingJournalEquityMap.set(
        'shareholder_account',
        openingJournalShareholder,
      );

      const openingAssets =
        openingAssetsBase + openingJournalPrepaid + openingJournalAccruedIncome;

      const openingVatCreditNotesQuery = this.creditNotesRepository
        .createQueryBuilder('creditNote')
        .select(['SUM(COALESCE(creditNote.vat_amount, 0)) AS vat'])
        .where('creditNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('creditNote.credit_note_date < :startDate', { startDate })
        .andWhere('creditNote.status IN (:...statuses)', {
          statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
        })
        .andWhere('creditNote.vat_amount > 0');
      // Opening customer debit note VAT (for VAT Payable in Balance Sheet)
      // Only include debit notes linked to invoices, not expenses
      const openingVatDebitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select(['SUM(COALESCE(debitNote.vat_amount, 0)) AS vat'])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.debit_note_date < :startDate', { startDate })
        .andWhere('debitNote.invoice_id IS NOT NULL') // Only customer debit notes
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        })
        .andWhere('debitNote.vat_amount > 0');
      const [openingVatCreditNotesRow, openingVatDebitNotesRow] =
        await Promise.all([
          openingVatCreditNotesQuery.getRawOne(),
          openingVatDebitNotesQuery.getRawOne(),
        ]);
      const openingVatCreditNotes = Number(openingVatCreditNotesRow?.vat || 0);
      const openingVatDebitNotes = Number(openingVatDebitNotesRow?.vat || 0);
      const openingNetVatPayable =
        openingVatPayable - openingVatCreditNotes + openingVatDebitNotes;
      const openingLiabilities =
        openingAccruals + openingNetVatPayable + openingJournalOutstanding;

      const openingEquity =
        openingNetRevenue -
        openingExpenses -
        openingJournalDepreciation +
        openingJournalEquity -
        openingJournalShareholder -
        openingJournalOutstanding;

      // Calculate period amounts (period = total - opening)
      // Note: netRevenue and totalExpenses contain ALL amounts up to asOfDate, not just period
      const periodRevenue = netRevenue - openingNetRevenue;
      const periodExpenses = totalExpenses - openingExpenses;
      const periodJournalEquity = totalJournalEquity - openingJournalEquity;
      const periodJournalShareholder =
        totalJournalShareholder - openingJournalShareholder;
      const periodJournalDepreciation =
        totalJournalDepreciation - openingJournalDepreciation;
      const periodJournalOutstanding =
        totalJournalOutstanding - openingJournalOutstanding;

      // Recalculate totalEquity using period amounts (not total amounts)
      // This represents equity changes during the period (startDate to asOfDate)
      const totalEquity =
        periodRevenue -
        periodExpenses -
        periodJournalDepreciation +
        periodJournalEquity -
        periodJournalShareholder -
        periodJournalOutstanding;

      const closingAssets = openingAssets + totalAssets;
      const closingLiabilities = openingLiabilities + totalLiabilities;
      const closingEquity = openingEquity + totalEquity;

      const equityItems: Array<{
        account: string;
        opening: number;
        period: number;
        closing: number;
      }> = [];

      const openingShareCapital = Number(
        openingJournalEquityMap.get('share_capital') || 0,
      );
      // Period Share Capital should only include entries from startDate to asOfDate
      // journalEquityMap contains ALL entries up to asOfDate, so we need to subtract opening
      const totalShareCapital = Number(
        journalEquityMap.get('share_capital') || 0,
      );
      const periodShareCapital = totalShareCapital - openingShareCapital;
      const closingShareCapital = openingShareCapital + periodShareCapital;
      equityItems.push({
        account: 'Share Capital',
        opening: Number(openingShareCapital.toFixed(2)),
        period: Number(periodShareCapital.toFixed(2)),
        closing: Number(closingShareCapital.toFixed(2)),
      });

      const openingRetainedEarningsJournal = Number(
        openingJournalEquityMap.get('retained_earnings') || 0,
      );
      // Period Retained Earnings Journal should only include entries from startDate to asOfDate
      // journalEquityMap contains ALL entries up to asOfDate, so we need to subtract opening
      const totalRetainedEarningsJournal = Number(
        journalEquityMap.get('retained_earnings') || 0,
      );
      const periodRetainedEarningsJournal =
        totalRetainedEarningsJournal - openingRetainedEarningsJournal;
      const openingRetainedEarnings =
        openingNetRevenue - openingExpenses + openingRetainedEarningsJournal;
      const periodRetainedEarnings =
        netRevenue - totalExpenses + periodRetainedEarningsJournal;
      const closingRetainedEarnings =
        openingRetainedEarnings + periodRetainedEarnings;
      equityItems.push({
        account: 'Retained Earnings',
        opening: Number(openingRetainedEarnings.toFixed(2)),
        period: Number(periodRetainedEarnings.toFixed(2)),
        closing: Number(closingRetainedEarnings.toFixed(2)),
      });

      const openingShareholderAccount = Number(
        openingJournalEquityMap.get('shareholder_account') || 0,
      );
      // Period Shareholder Account should only include entries from startDate to asOfDate
      // journalEquityMap contains ALL entries up to asOfDate, so we need to subtract opening
      const totalShareholderAccount = Number(
        journalEquityMap.get('shareholder_account') || 0,
      );
      const periodShareholderAccount =
        totalShareholderAccount - openingShareholderAccount;
      const closingShareholderAccount =
        openingShareholderAccount + periodShareholderAccount;
      equityItems.push({
        account: 'Shareholder Account',
        opening: Number(openingShareholderAccount.toFixed(2)),
        period: Number(periodShareholderAccount.toFixed(2)),
        closing: Number(closingShareholderAccount.toFixed(2)),
      });

      const result = {
        asOfDate,
        period: {
          startDate,
          endDate: asOfDate,
        },
        assets: {
          items: assets,
          opening: Number(openingAssets.toFixed(2)),
          period: Number(totalAssets.toFixed(2)),
          closing: Number(closingAssets.toFixed(2)),
          total: Number(totalAssets.toFixed(2)),
        },
        liabilities: {
          items: liabilities,
          opening: Number(openingLiabilities.toFixed(2)),
          period: Number(totalLiabilities.toFixed(2)),
          closing: Number(closingLiabilities.toFixed(2)),
          total: Number(totalLiabilities.toFixed(2)),
        },
        equity: {
          items: equityItems,
          revenue: Number(totalRevenue.toFixed(2)),
          creditNotes: Number(creditNotesAmount.toFixed(2)),
          debitNotes: Number(debitNotesAmount.toFixed(2)),
          netRevenue: Number(netRevenue.toFixed(2)),
          expenses: Number(totalExpenses.toFixed(2)),
          journalEquity: Number(totalJournalEquity.toFixed(2)),
          journalShareholder: Number(totalJournalShareholder.toFixed(2)),
          opening: Number(openingEquity.toFixed(2)),
          period: Number(totalEquity.toFixed(2)),
          closing: Number(closingEquity.toFixed(2)),
          total: Number(closingEquity.toFixed(2)),
          net: Number(totalEquity.toFixed(2)),
        },
        summary: {
          openingAssets: Number(openingAssets.toFixed(2)),
          openingLiabilities: Number(openingLiabilities.toFixed(2)),
          openingEquity: Number(openingEquity.toFixed(2)),
          openingBalance: Number(
            (openingAssets - openingLiabilities - openingEquity).toFixed(2),
          ),
          periodAssets: Number(totalAssets.toFixed(2)),
          periodLiabilities: Number(totalLiabilities.toFixed(2)),
          periodEquity: Number(totalEquity.toFixed(2)),
          totalAssets: Number(totalAssets.toFixed(2)),
          totalLiabilities: Number(totalLiabilities.toFixed(2)),
          totalEquity: Number(totalEquity.toFixed(2)),
          closingAssets: Number(closingAssets.toFixed(2)),
          closingLiabilities: Number(closingLiabilities.toFixed(2)),
          closingEquity: Number(closingEquity.toFixed(2)),
          closingBalance: Number(
            (closingAssets - closingLiabilities - closingEquity).toFixed(2),
          ),
          balance: Number(
            (totalAssets - totalLiabilities - totalEquity).toFixed(2),
          ),
        },
      };

      return result;
    } catch (error) {
      throw error;
    }
  }

  private async buildProfitAndLoss(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    const startDate =
      filters?.['startDate'] ||
      new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const endDate =
      filters?.['endDate'] || new Date().toISOString().split('T')[0];

    const revenueQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        'SUM(COALESCE(invoice.base_amount, invoice.amount)) AS revenue',
        'SUM(invoice.vat_amount) AS vat',
        'COUNT(invoice.id) AS count',
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date >= :startDate', { startDate })
      .andWhere('invoice.invoice_date <= :endDate', { endDate });

    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      revenueQuery.andWhere('invoice.status IN (:...statuses)', { statuses });
    }

    const creditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select([
        'SUM(COALESCE(creditNote.base_amount, creditNote.amount)) AS amount',
        'SUM(creditNote.vat_amount) AS vat',
        'COUNT(creditNote.id) AS count',
      ])
      .where('creditNote.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('creditNote.credit_note_date >= :startDate', { startDate })
      .andWhere('creditNote.credit_note_date <= :endDate', { endDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      });

    const debitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'SUM(COALESCE(debitNote.base_amount, debitNote.amount)) AS amount',
        'SUM(debitNote.vat_amount) AS vat',
        'COUNT(debitNote.id) AS count',
      ])
      .where('debitNote.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
      .andWhere('debitNote.debit_note_date <= :endDate', { endDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    const [revenueResult, creditNotesResult, debitNotesResult] =
      await Promise.all([
        revenueQuery.getRawOne(),
        creditNotesQuery.getRawOne(),
        debitNotesQuery.getRawOne(),
      ]);

    const totalRevenue = Number(revenueResult?.revenue || 0);
    const revenueVat = Number(revenueResult?.vat || 0);
    const creditNotesAmount = Number(creditNotesResult?.amount || 0);
    const creditNotesVat = Number(creditNotesResult?.vat || 0);
    const debitNotesAmount = Number(debitNotesResult?.amount || 0);
    const debitNotesVat = Number(debitNotesResult?.vat || 0);

    const netRevenue = totalRevenue - creditNotesAmount + debitNotesAmount;
    const netRevenueVat = revenueVat - creditNotesVat + debitNotesVat;

    const expenseQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .leftJoin('expense.category', 'category')
      .select([
        "COALESCE(category.name, 'Uncategorized') AS category",
        'SUM(COALESCE(expense.base_amount, expense.amount)) AS amount',
        'SUM(expense.vat_amount) AS vat',
        'COUNT(expense.id) AS count',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date >= :startDate', { startDate })
      .andWhere('expense.expense_date <= :endDate', { endDate })
      .andWhere("(expense.type IS NULL OR expense.type != 'credit')")
      .groupBy('category.name')
      .orderBy('MAX(expense.created_at)', 'DESC');

    if (filters?.['type']) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      expenseQuery.andWhere('expense.type IN (:...types)', { types });
    }

    // Get payroll expenses separately
    const payrollExpenseQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select([
        "'Payroll' AS category",
        'SUM(COALESCE(expense.base_amount, expense.amount)) AS amount',
        'SUM(expense.vat_amount) AS vat',
        'COUNT(expense.id) AS count',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date >= :startDate', { startDate })
      .andWhere('expense.expense_date <= :endDate', { endDate })
      .andWhere("expense.vendor_name = 'Payroll'")
      .andWhere("(expense.type IS NULL OR expense.type != 'credit')");

    const payrollExpenseRow = await payrollExpenseQuery.getRawOne();
    const payrollExpenseAmount = Number(payrollExpenseRow?.amount || 0);
    const payrollExpenseVat = Number(payrollExpenseRow?.vat || 0);

    const expenseRows = await expenseQuery.getRawMany();

    // Add payroll expenses to expense breakdown if not already included
    const hasPayrollCategory = expenseRows.some(
      (row) => row.category === 'Payroll' || row.category === 'Uncategorized',
    );
    if (payrollExpenseAmount > 0 && !hasPayrollCategory) {
      expenseRows.push({
        category: 'Payroll',
        amount: payrollExpenseAmount.toString(),
        vat: payrollExpenseVat.toString(),
        count: payrollExpenseRow?.count || '0',
      });
    }

    const totalExpenses = expenseRows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );
    const expenseVat = expenseRows.reduce(
      (sum, row) => sum + Number(row.vat || 0),
      0,
    );

    const netProfit = netRevenue - totalExpenses;

    const openingRevenueQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select(['SUM(COALESCE(invoice.base_amount, invoice.amount)) AS revenue'])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date < :startDate', { startDate });

    const openingExpensesQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select(['SUM(COALESCE(expense.base_amount, expense.amount)) AS amount'])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date < :startDate', { startDate })
      .andWhere("(expense.type IS NULL OR expense.type != 'credit')");

    if (filters?.['type']) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      openingExpensesQuery.andWhere('expense.type IN (:...types)', { types });
    }

    const [openingRevenueRow, openingExpensesRow] = await Promise.all([
      openingRevenueQuery.getRawOne(),
      openingExpensesQuery.getRawOne(),
    ]);

    const openingRevenue = Number(openingRevenueRow?.revenue || 0);
    const openingExpenses = Number(openingExpensesRow?.amount || 0);
    const openingRetainedEarnings = openingRevenue - openingExpenses;

    const closingRetainedEarnings = openingRetainedEarnings + netProfit;

    return {
      period: {
        startDate,
        endDate,
      },
      revenue: {
        amount: Number(totalRevenue.toFixed(2)),
        vat: Number(revenueVat.toFixed(2)),
        total: Number((totalRevenue + revenueVat).toFixed(2)),
        count: Number(revenueResult?.count || 0),
        creditNotes: {
          amount: Number(creditNotesAmount.toFixed(2)),
          vat: Number(creditNotesVat.toFixed(2)),
          total: Number((creditNotesAmount + creditNotesVat).toFixed(2)),
          count: Number(creditNotesResult?.count || 0),
        },
        debitNotes: {
          amount: Number(debitNotesAmount.toFixed(2)),
          vat: Number(debitNotesVat.toFixed(2)),
          total: Number((debitNotesAmount + debitNotesVat).toFixed(2)),
          count: Number(debitNotesResult?.count || 0),
        },
        netAmount: Number(netRevenue.toFixed(2)),
        netVat: Number(netRevenueVat.toFixed(2)),
        netTotal: Number((netRevenue + netRevenueVat).toFixed(2)),
      },
      expenses: {
        items: expenseRows.map((row) => ({
          category: row.category,
          amount: Number(row.amount || 0),
          vat: Number(row.vat || 0),
          total: Number(
            (Number(row.amount || 0) + Number(row.vat || 0)).toFixed(2),
          ),
          count: Number(row.count || 0),
        })),
        total: Number(totalExpenses.toFixed(2)),
        vat: Number(expenseVat.toFixed(2)),
        grandTotal: Number((totalExpenses + expenseVat).toFixed(2)),
      },
      summary: {
        openingRetainedEarnings: Number(openingRetainedEarnings.toFixed(2)),
        grossProfit: Number(netRevenue.toFixed(2)),
        totalExpenses: Number(totalExpenses.toFixed(2)),
        netProfit: Number(netProfit.toFixed(2)),
        closingRetainedEarnings: Number(closingRetainedEarnings.toFixed(2)),
        netProfitMargin:
          netRevenue > 0
            ? Number(((netProfit / netRevenue) * 100).toFixed(2))
            : 0,
      },
    };
  }

  private async buildPayables(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    const asOfDate =
      filters?.['endDate'] || new Date().toISOString().split('T')[0];
    const startDate = filters?.['startDate'] || null;

    // Subquery to calculate paid amount for each expense
    const expensePaymentsSubquery = this.expensePaymentsRepository
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount), 0)')
      .where('payment.expense_id = expense.id')
      .andWhere('payment.payment_date <= :asOfDate')
      .andWhere('payment.organization_id = :organizationId')
      .andWhere('payment.is_deleted = false')
      .getQuery();

    // Subquery to calculate debit note applications for each expense
    const debitNoteExpenseApplicationsSubquery =
      this.debitNoteExpenseApplicationsRepository
        .createQueryBuilder('dnea')
        .select('COALESCE(SUM(dnea.appliedAmount), 0)')
        .where('dnea.expense_id = expense.id')
        .andWhere('dnea.organization_id = :organizationId')
        .getQuery();

    const query = this.accrualsRepository
      .createQueryBuilder('accrual')
      .leftJoin('accrual.expense', 'expense')
      .leftJoin('expense.category', 'category')
      .leftJoin('expense.vendor', 'vendor')
      .select([
        'accrual.id AS accrualId',
        "COALESCE(accrual.vendor_name, expense.vendor_name, vendor.name, 'N/A') AS vendor",
        'expense.total_amount AS expenseTotalAmount',
        `(${expensePaymentsSubquery}) AS paidAmount`,
        `(${debitNoteExpenseApplicationsSubquery}) AS debitNoteAppliedAmount`,
        'accrual.expected_payment_date AS expectedDate',
        'accrual.settlement_date AS settlementDate',
        'accrual.status AS status',
        "COALESCE(category.name, 'Uncategorized') AS category",
        'expense.description AS description',
      ])
      .where('accrual.organization_id = :organizationId', { organizationId })
      .andWhere('accrual.is_deleted = false')
      .andWhere('expense.is_deleted = false')
      .setParameter('organizationId', organizationId)
      .setParameter('asOfDate', asOfDate);

    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      query.andWhere('accrual.status IN (:...statuses)', { statuses });
    } else {
      query.andWhere('accrual.status = :status', {
        status: AccrualStatus.PENDING_SETTLEMENT,
      });
    }

    if (filters?.['endDate']) {
      query.andWhere('expense.expense_date <= :asOfDate', {
        asOfDate: filters.endDate,
      });
    }

    if (filters?.['startDate']) {
      query.andWhere('expense.expense_date >= :startDate', {
        startDate: filters.startDate,
      });
    }

    if (filters?.['vendorName']) {
      const vendors = Array.isArray(filters.vendorName)
        ? filters.vendorName
        : [filters.vendorName];
      query.andWhere(
        '(accrual.vendor_name IN (:...vendors) OR expense.vendor_name IN (:...vendors) OR vendor.name IN (:...vendors))',
        { vendors },
      );
    }

    query.orderBy('accrual.created_at', 'DESC');

    const rows = await query.getRawMany();

    // Calculate outstanding balance for each row
    const payables = rows.map((row) => {
      const expenseTotal = Number(
        row.expensetotalamount || row.expenseTotalAmount || 0,
      );
      const paidAmount = Number(row.paidamount || row.paidAmount || 0);
      const debitNoteApplied = Number(
        row.debitnoteappliedamount || row.debitNoteAppliedAmount || 0,
      );
      const outstanding = expenseTotal - paidAmount - debitNoteApplied;

      return {
        ...row,
        outstandingAmount: outstanding > 0 ? outstanding : 0,
      };
    });

    const overdueItems = payables.filter(
      (row) =>
        row.status === AccrualStatus.PENDING_SETTLEMENT &&
        (row.expecteddate || row.expectedDate) &&
        new Date(row.expecteddate || row.expectedDate) < new Date(asOfDate) &&
        row.outstandingAmount > 0,
    );

    const totalAmount = payables.reduce(
      (sum, row) => sum + row.outstandingAmount,
      0,
    );
    const overdueAmount = overdueItems.reduce(
      (sum, row) => sum + row.outstandingAmount,
      0,
    );

    // Calculate opening and period balances using outstanding amounts
    let openingBalance = 0;
    let periodAmount = totalAmount;

    if (startDate) {
      // Opening balance: outstanding amounts before start date
      const openingExpensePaymentsSubquery = this.expensePaymentsRepository
        .createQueryBuilder('payment')
        .select('COALESCE(SUM(payment.amount), 0)')
        .where('payment.expense_id = expense.id')
        .andWhere('payment.payment_date < :startDate')
        .andWhere('payment.organization_id = :organizationId')
        .andWhere('payment.is_deleted = false')
        .getQuery();

      const openingDebitNoteExpenseApplicationsSubquery =
        this.debitNoteExpenseApplicationsRepository
          .createQueryBuilder('dnea')
          .select('COALESCE(SUM(dnea.appliedAmount), 0)')
          .where('dnea.expense_id = expense.id')
          .andWhere('dnea.organization_id = :organizationId')
          .getQuery();

      const openingQuery = this.accrualsRepository
        .createQueryBuilder('accrual')
        .leftJoin('accrual.expense', 'expense')
        .select([
          `SUM(GREATEST(0, COALESCE(expense.total_amount, 0) - (${openingExpensePaymentsSubquery}) - (${openingDebitNoteExpenseApplicationsSubquery}))) AS amount`,
        ])
        .where('accrual.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('accrual.is_deleted = false')
        .andWhere('expense.is_deleted = false')
        .andWhere('accrual.status = :status', {
          status: AccrualStatus.PENDING_SETTLEMENT,
        })
        .andWhere('accrual.created_at::date < :startDate', { startDate })
        .setParameter('organizationId', organizationId)
        .setParameter('startDate', startDate);

      if (filters?.['status']) {
        const statuses = Array.isArray(filters.status)
          ? filters.status
          : [filters.status];
        openingQuery.andWhere('accrual.status IN (:...statuses)', {
          statuses,
        });
      }

      const openingRow = await openingQuery.getRawOne();
      openingBalance = Number(openingRow?.amount || 0);

      // Period amount: new outstanding amounts in the period
      // This is already calculated as totalAmount above
      periodAmount = totalAmount;
    }

    const closingBalance = openingBalance + periodAmount;

    // Group by supplier to calculate pending balance per supplier
    const supplierBalances = new Map<
      string,
      {
        vendor: string;
        totalAmount: number;
        itemCount: number;
        overdueAmount: number;
        overdueCount: number;
      }
    >();

    payables.forEach((row) => {
      const vendor = row.vendor || 'N/A';
      const outstanding = row.outstandingAmount;
      const isOverdue =
        row.status === AccrualStatus.PENDING_SETTLEMENT &&
        (row.expecteddate || row.expectedDate) &&
        new Date(row.expecteddate || row.expectedDate) < new Date(asOfDate) &&
        outstanding > 0;

      const existing = supplierBalances.get(vendor) || {
        vendor,
        totalAmount: 0,
        itemCount: 0,
        overdueAmount: 0,
        overdueCount: 0,
      };

      existing.totalAmount += outstanding;
      existing.itemCount += 1;
      if (isOverdue) {
        existing.overdueAmount += outstanding;
        existing.overdueCount += 1;
      }

      supplierBalances.set(vendor, existing);
    });

    // Convert supplier balances to array
    const supplierSummary = Array.from(supplierBalances.values())
      .map((s) => ({
        vendor: s.vendor,
        pendingBalance: Number(s.totalAmount.toFixed(2)),
        itemCount: s.itemCount,
        overdueAmount: Number(s.overdueAmount.toFixed(2)),
        overdueCount: s.overdueCount,
      }))
      .sort((a, b) => b.pendingBalance - a.pendingBalance); // Sort by balance descending

    const result = {
      asOfDate,
      period: startDate ? { startDate, endDate: asOfDate } : undefined,
      items: payables
        .filter((row) => row.outstandingAmount > 0)
        .map((row) => ({
          accrualId: row.accrualid || row.accrualId,
          vendor: row.vendor || 'N/A',
          amount: row.outstandingAmount,
          expectedDate: row.expecteddate || row.expectedDate,
          settlementDate: row.settlementdate || row.settlementDate,
          status: row.status,
          category: row.category,
          description: row.description || 'N/A',
          isOverdue:
            row.status === AccrualStatus.PENDING_SETTLEMENT &&
            (row.expecteddate || row.expectedDate) &&
            new Date(row.expecteddate || row.expectedDate) <
              new Date(asOfDate) &&
            row.outstandingAmount > 0,
        })),
      supplierSummary, // Add supplier-level summary with pending balances
      summary: {
        openingBalance: Number(openingBalance.toFixed(2)),
        periodAmount: Number(periodAmount.toFixed(2)),
        closingBalance: Number(closingBalance.toFixed(2)),
        totalItems: payables.filter((r) => r.outstandingAmount > 0).length,
        totalAmount: Number(totalAmount.toFixed(2)),
        overdueItems: overdueItems.length,
        overdueAmount: Number(overdueAmount.toFixed(2)),
        paidItems: payables.filter(
          (r) => r.status === AccrualStatus.SETTLED || r.outstandingAmount <= 0,
        ).length,
        pendingItems: payables.filter(
          (r) =>
            r.status === AccrualStatus.PENDING_SETTLEMENT &&
            r.outstandingAmount > 0,
        ).length,
        totalSuppliers: supplierSummary.length,
      },
    };

    return result;
  }

  private async buildReceivables(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    const asOfDate =
      filters?.['endDate'] || new Date().toISOString().split('T')[0];
    const startDate = filters?.['startDate'] || null;

    const creditNoteApplicationsSubquery = this.creditNoteApplicationsRepository
      .createQueryBuilder('cna')
      .select('COALESCE(SUM(cna.appliedAmount), 0)')
      .where('cna.invoice_id = invoice.id')
      .andWhere('cna.organization_id = :organizationId', { organizationId })
      .getQuery();

    // Subquery for customer debit note applications (increase receivables)
    // Note: DebitNoteApplication is for customer debit notes (linked to invoices)
    const debitNoteApplicationsSubquery = this.debitNoteApplicationsRepository
      .createQueryBuilder('dna')
      .select('COALESCE(SUM(dna.appliedAmount), 0)')
      .where('dna.invoice_id = invoice.id')
      .andWhere('dna.organization_id = :organizationId', { organizationId })
      .getQuery();

    const query = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .leftJoin('invoice.customer', 'customer')
      .select([
        'invoice.id AS invoiceId',
        'invoice.invoice_number AS invoiceNumber',
        "COALESCE(customer.name, invoice.customer_name, 'N/A') AS customer",
        'invoice.amount AS amount',
        'invoice.vat_amount AS vat',
        'invoice.total_amount AS total',
        'invoice.invoice_date AS invoiceDate',
        'invoice.due_date AS dueDate',
        'invoice.paid_amount AS paidAmount',
        'invoice.paid_date AS paidDate',
        'invoice.status AS status',
        'invoice.payment_status AS paymentStatus',
        `(${creditNoteApplicationsSubquery}) AS appliedCreditAmount`,
        `(${debitNoteApplicationsSubquery}) AS appliedDebitAmount`,
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .setParameter('organizationId', organizationId);

    if (filters?.['paymentStatus']) {
      const statuses = Array.isArray(filters.paymentStatus)
        ? filters.paymentStatus
        : [filters.paymentStatus];
      query.andWhere('invoice.payment_status IN (:...statuses)', {
        statuses,
      });
    } else {
      // Default: Only include unpaid/partial invoices to match trial balance logic
      // This ensures consistency between receivables report and trial balance
      query.andWhere('invoice.payment_status IN (:...statuses)', {
        statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
      });
    }

    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      query.andWhere('invoice.status IN (:...statuses)', { statuses });
    }

    if (filters?.['endDate']) {
      query.andWhere('invoice.invoice_date <= :endDate', {
        endDate: filters.endDate,
      });
    }

    if (filters?.['customerName']) {
      const customers = Array.isArray(filters.customerName)
        ? filters.customerName
        : [filters.customerName];
      query.andWhere(
        '(customer.name IN (:...customers) OR invoice.customer_name IN (:...customers))',
        { customers },
      );
    }

    query.orderBy('invoice.created_at', 'DESC');

    const rows = await query.getRawMany();

    const unappliedCreditNoteApplicationsSubquery =
      this.creditNoteApplicationsRepository
        .createQueryBuilder('cna')
        .select('COALESCE(SUM(cna.appliedAmount), 0)')
        .where('cna.credit_note_id = creditNote.id')
        .andWhere('cna.organization_id = :organizationId', { organizationId })
        .getQuery();

    const unappliedCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .leftJoin('creditNote.customer', 'customer')
      .leftJoin('creditNote.invoice', 'invoice')
      .select([
        'creditNote.id AS creditNoteId',
        'creditNote.credit_note_number AS creditNoteNumber',
        "COALESCE(customer.name, creditNote.customer_name, 'N/A') AS customer",
        'creditNote.amount AS amount',
        'creditNote.vat_amount AS vat',
        'creditNote.total_amount AS total',
        'creditNote.credit_note_date AS creditNoteDate',
        'creditNote.status AS status',
        'invoice.invoice_number AS relatedInvoice',
        `(${unappliedCreditNoteApplicationsSubquery}) AS appliedAmount`,
      ])
      .where('creditNote.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      })
      .andWhere(
        `creditNote.total_amount > (${unappliedCreditNoteApplicationsSubquery})`,
      )
      .setParameter('organizationId', organizationId);

    if (filters?.['startDate']) {
      unappliedCreditNotesQuery.andWhere(
        'creditNote.credit_note_date >= :startDate',
        {
          startDate: filters.startDate,
        },
      );
    }
    if (filters?.['endDate']) {
      unappliedCreditNotesQuery.andWhere(
        'creditNote.credit_note_date <= :endDate',
        {
          endDate: filters.endDate,
        },
      );
    }
    if (filters?.['customerName']) {
      const customers = Array.isArray(filters.customerName)
        ? filters.customerName
        : [filters.customerName];
      unappliedCreditNotesQuery.andWhere(
        '(customer.name IN (:...customers) OR creditNote.customer_name IN (:...customers))',
        { customers },
      );
    }

    // Only customer debit notes (linked to invoices), not supplier debit notes
    const debitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .leftJoin('debitNote.customer', 'customer')
      .leftJoin('debitNote.invoice', 'invoice')
      .select([
        'debitNote.id AS debitNoteId',
        'debitNote.debit_note_number AS debitNoteNumber',
        "COALESCE(customer.name, debitNote.customer_name, 'N/A') AS customer",
        'debitNote.amount AS amount',
        'debitNote.vat_amount AS vat',
        'debitNote.total_amount AS total',
        'debitNote.debit_note_date AS debitNoteDate',
        'debitNote.status AS status',
        'invoice.invoice_number AS relatedInvoice',
      ])
      .where('debitNote.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('debitNote.invoice_id IS NOT NULL') // Only customer debit notes
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    if (filters?.['startDate']) {
      debitNotesQuery.andWhere('debitNote.debit_note_date >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters?.['endDate']) {
      debitNotesQuery.andWhere('debitNote.debit_note_date <= :endDate', {
        endDate: filters.endDate,
      });
    }
    if (filters?.['customerName']) {
      const customers = Array.isArray(filters.customerName)
        ? filters.customerName
        : [filters.customerName];
      debitNotesQuery.andWhere(
        '(customer.name IN (:...customers) OR debitNote.customer_name IN (:...customers))',
        { customers },
      );
    }

    const [unappliedCreditNotesRows, debitNotesRows] = await Promise.all([
      unappliedCreditNotesQuery.getRawMany(),
      debitNotesQuery.getRawMany(),
    ]);

    const invoiceItems = rows.map((row) => {
      const total = Number(row.total || 0);
      const paid = Number(row.paidamount || row.paidAmount || 0);
      const appliedCreditAmount = Number(
        row.appliedcreditamount || row.appliedCreditAmount || 0,
      );
      const appliedDebitAmount = Number(
        row.applieddebitamount || row.appliedDebitAmount || 0,
      );

      // Outstanding = total - paid - credit_notes + debit_notes
      const outstanding = Math.max(
        0,
        total - paid - appliedCreditAmount + appliedDebitAmount,
      );
      const paymentStatus = row.paymentstatus || row.paymentStatus;
      const dueDate = row.duedate || row.dueDate;
      const isOverdue =
        paymentStatus !== PaymentStatus.PAID &&
        dueDate &&
        new Date(dueDate) < new Date(asOfDate);

      return {
        type: 'invoice',
        invoiceId: row.invoiceid || row.invoiceId,
        invoiceNumber: row.invoicenumber || row.invoiceNumber,
        customer: row.customer,
        amount: Number(row.amount || 0),
        vat: Number(row.vat || 0),
        total: total,
        paid: paid,
        outstanding: outstanding,
        invoiceDate: row.invoicedate || row.invoiceDate,
        dueDate: dueDate,
        paidDate: row.paiddate || row.paidDate,
        status: row.status,
        paymentStatus: paymentStatus,
        isOverdue,
      };
    });

    const unappliedCreditNoteItems = unappliedCreditNotesRows.map((row) => {
      const total = Number(row.total || 0);
      const appliedAmount = Number(row.appliedamount || row.appliedAmount || 0);
      const unappliedAmount = total - appliedAmount;
      return {
        type: 'credit_note',
        creditNoteId: row.creditnoteid || row.creditNoteId,
        creditNoteNumber: row.creditnotenumber || row.creditNoteNumber,
        customer: row.customer,
        amount: Number(row.amount || 0),
        vat: Number(row.vat || 0),
        total: total,
        appliedAmount: appliedAmount,
        unappliedAmount: unappliedAmount,
        paid: 0,
        outstanding: -unappliedAmount,
        invoiceDate: row.creditnotedate || row.creditNoteDate,
        dueDate: null,
        paidDate: null,
        status: row.status,
        paymentStatus: null,
        relatedInvoice: row.relatedinvoice || row.relatedInvoice,
        isOverdue: false,
      };
    });

    const debitNoteItems = debitNotesRows.map((row) => {
      const total = Number(row.total || 0);
      return {
        type: 'debit_note',
        debitNoteId: row.debitnoteid || row.debitNoteId,
        debitNoteNumber: row.debitnotenumber || row.debitNoteNumber,
        customer: row.customer,
        amount: Number(row.amount || 0),
        vat: Number(row.vat || 0),
        total: total,
        paid: 0,
        outstanding: total,
        invoiceDate: row.debitnotedate || row.debitNoteDate,
        dueDate: null,
        paidDate: null,
        status: row.status,
        paymentStatus: null,
        relatedInvoice: row.relatedinvoice || row.relatedInvoice,
        isOverdue: false,
      };
    });

    const filteredInvoiceItems = invoiceItems.filter(
      (item) => item.outstanding > 0,
    );

    const allItems = [
      ...filteredInvoiceItems,
      ...unappliedCreditNoteItems,
      ...debitNoteItems,
    ];

    const overdueItems = allItems.filter((item) => item.isOverdue);

    // Calculate totalOutstanding: sum of all items' outstanding amounts
    // This includes invoices (positive), unapplied credit notes (negative), and debit notes (positive)
    const totalOutstanding = allItems.reduce(
      (sum, item) => sum + item.outstanding,
      0,
    );

    // Calculate receivables balance to match trial balance:
    // Trial balance includes: invoices (unpaid/partial) + debit notes
    // It does NOT include unapplied credit notes in receivables (they are separate)
    const receivablesBalanceForTrialBalance =
      filteredInvoiceItems.reduce((sum, item) => sum + item.outstanding, 0) +
      debitNoteItems.reduce((sum, item) => sum + item.outstanding, 0);
    const overdueAmount = overdueItems.reduce(
      (sum, item) => sum + item.outstanding,
      0,
    );

    let openingBalance = 0;
    // When no startDate, periodOutstanding should match receivablesBalanceForTrialBalance
    // (invoices + debit notes only, excluding unapplied credit notes)
    let periodOutstanding = receivablesBalanceForTrialBalance;

    if (startDate) {
      const openingCreditNoteApplicationsSubquery =
        this.creditNoteApplicationsRepository
          .createQueryBuilder('cna')
          .select('COALESCE(SUM(cna.appliedAmount), 0)')
          .where('cna.invoice_id = invoice.id')
          .andWhere('cna.organization_id = :organizationId', {
            organizationId,
          })
          .getQuery();

      const openingInvoicesQueryWithCN = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select([
          `SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0) - (${openingCreditNoteApplicationsSubquery})) AS outstanding`,
        ])
        .where('invoice.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('invoice.invoice_date < :startDate', { startDate })
        .andWhere('invoice.payment_status IN (:...statuses)', {
          statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
        })
        .setParameter('organizationId', organizationId);

      if (filters?.['paymentStatus']) {
        const statuses = Array.isArray(filters.paymentStatus)
          ? filters.paymentStatus
          : [filters.paymentStatus];
        openingInvoicesQueryWithCN.andWhere(
          'invoice.payment_status IN (:...statuses)',
          { statuses },
        );
      }

      // Opening customer debit notes (for Accounts Receivable report)
      // Only include debit notes linked to invoices, not expenses
      const openingDebitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select(['SUM(COALESCE(debitNote.total_amount, 0)) AS total'])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.invoice_id IS NOT NULL') // Only customer debit notes
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        })
        .andWhere('debitNote.debit_note_date < :startDate', { startDate });

      const [openingInvoicesRow, openingDebitNotesRow] = await Promise.all([
        openingInvoicesQueryWithCN.getRawOne(),
        openingDebitNotesQuery.getRawOne(),
      ]);

      const openingInvoices = Number(openingInvoicesRow?.outstanding || 0);
      const openingDebitNotes = Number(openingDebitNotesRow?.total || 0);
      openingBalance = openingInvoices + openingDebitNotes;

      const periodCreditNoteApplicationsSubquery =
        this.creditNoteApplicationsRepository
          .createQueryBuilder('cna')
          .select('COALESCE(SUM(cna.appliedAmount), 0)')
          .where('cna.invoice_id = invoice.id')
          .andWhere('cna.organization_id = :organizationId', {
            organizationId,
          })
          .getQuery();

      const periodInvoicesQuery = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select([
          `SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0) - (${periodCreditNoteApplicationsSubquery})) AS outstanding`,
        ])
        .where('invoice.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('invoice.invoice_date >= :startDate', { startDate })
        .andWhere('invoice.invoice_date <= :asOfDate', { asOfDate })
        .andWhere('invoice.payment_status IN (:...statuses)', {
          statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
        })
        .setParameter('organizationId', organizationId);

      if (filters?.['paymentStatus']) {
        const statuses = Array.isArray(filters.paymentStatus)
          ? filters.paymentStatus
          : [filters.paymentStatus];
        periodInvoicesQuery.andWhere(
          'invoice.payment_status IN (:...statuses)',
          { statuses },
        );
      }

      const periodDebitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select(['SUM(COALESCE(debitNote.total_amount, 0)) AS total'])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        })
        .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
        .andWhere('debitNote.debit_note_date <= :asOfDate', { asOfDate });

      const [periodInvoicesRow, periodDebitNotesRow] = await Promise.all([
        periodInvoicesQuery.getRawOne(),
        periodDebitNotesQuery.getRawOne(),
      ]);

      const periodInvoices = Number(periodInvoicesRow?.outstanding || 0);
      const periodDebitNotes = Number(periodDebitNotesRow?.total || 0);
      // Period outstanding should match trial balance: invoices + debit notes only
      // (excludes unapplied credit notes to match trial balance calculation)
      periodOutstanding = periodInvoices + periodDebitNotes;
    }

    // Closing balance should match trial balance calculation:
    // Trial balance shows receivables as: invoices (unpaid/partial) + debit notes
    // It does NOT include unapplied credit notes in receivables balance
    // This ensures consistency between receivables report and trial balance
    const closingBalance = receivablesBalanceForTrialBalance;

    return {
      asOfDate,
      period: startDate ? { startDate, endDate: asOfDate } : undefined,
      items: allItems,
      summary: {
        openingBalance: Number(openingBalance.toFixed(2)),
        periodOutstanding: Number(periodOutstanding.toFixed(2)),
        periodAmount: Number(periodOutstanding.toFixed(2)),
        closingBalance: Number(closingBalance.toFixed(2)),
        totalInvoices: filteredInvoiceItems.length,
        totalCreditNotes: unappliedCreditNoteItems.length,
        totalDebitNotes: debitNoteItems.length,
        totalItems: allItems.length,
        totalOutstanding: Number(totalOutstanding.toFixed(2)),
        overdueInvoices: overdueItems.length,
        overdueAmount: Number(overdueAmount.toFixed(2)),
        paidInvoices: filteredInvoiceItems.filter(
          (i) => i.paymentStatus === PaymentStatus.PAID,
        ).length,
        unpaidInvoices: filteredInvoiceItems.filter(
          (i) => i.paymentStatus === PaymentStatus.UNPAID,
        ).length,
        partialInvoices: filteredInvoiceItems.filter(
          (i) => i.paymentStatus === PaymentStatus.PARTIAL,
        ).length,
      },
    };
  }

  private async buildVatControlAccount(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    let startDate = filters?.['startDate'];
    let endDate = filters?.['endDate'];

    if (!startDate || !endDate) {
      const today = new Date();
      startDate = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .split('T')[0];
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
        .toISOString()
        .split('T')[0];
    }

    const vatInputQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select([
        'expense.id AS expenseId',
        'expense.expense_date AS expenseDate',
        'expense.description AS description',
        'expense.vendor_name AS vendorName',
        'expense.vendor_trn AS trn',
        'COALESCE(expense.base_amount, expense.amount) AS amount',
        'expense.vat_amount AS vatAmount',
        'expense.vat_tax_type AS vatTaxType',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date >= :startDate', { startDate })
      .andWhere('expense.expense_date <= :endDate', { endDate })
      .andWhere('CAST(expense.vat_amount AS DECIMAL) > 0')
      .andWhere(
        "(expense.vat_tax_type IS NULL OR expense.vat_tax_type != 'reverse_charge')",
      )
      .andWhere("(expense.type IS NULL OR expense.type != 'credit')")
      .orderBy('expense.created_at', 'DESC');

    const vatInputExpenses = await vatInputQuery.getRawMany();

    const vatInputItems = vatInputExpenses.map((expense: any) => {
      const vatAmount = parseFloat(
        expense.vatamount || expense.vatAmount || '0',
      );
      const amount = parseFloat(expense.amount || '0');

      const baseAmount = amount;
      const grossAmount = amount + vatAmount;
      const vatRate =
        baseAmount > 0 ? ((vatAmount / baseAmount) * 100).toFixed(2) : '0';
      const vendorName = expense.vendorname || expense.vendorName || 'N/A';
      const trn = expense.trn || null;

      return {
        id: expense.expenseid || expense.expenseId,
        date: expense.expensedate || expense.expenseDate,
        description: expense.description || vendorName || 'Expense',
        vendorName: vendorName,
        amount: Number(baseAmount.toFixed(2)),
        grossAmount: Number(grossAmount.toFixed(2)),
        vatRate: Number(vatRate),
        vatAmount: Number(vatAmount.toFixed(2)),
        trn: trn,
        type: 'expense',
      };
    });

    const vatOutputQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        'invoice.id AS invoiceId',
        'invoice.invoice_date AS invoiceDate',
        'invoice.invoice_number AS invoiceNumber',
        'invoice.customer_name AS customerName',
        'invoice.customer_trn AS trn',
        'invoice.amount AS amount',
        'invoice.vat_amount AS vatAmount',
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.is_deleted = false')
      .andWhere('invoice.invoice_date >= :startDate', { startDate })
      .andWhere('invoice.invoice_date <= :endDate', { endDate })
      .andWhere('CAST(invoice.vat_amount AS DECIMAL) > 0')
      .orderBy('invoice.created_at', 'DESC');

    const vatCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select([
        'creditNote.id AS creditNoteId',
        'creditNote.credit_note_date AS creditNoteDate',
        'creditNote.credit_note_number AS creditNoteNumber',
        'creditNote.customer_name AS customerName',
        'creditNote.customer_trn AS trn',
        'creditNote.amount AS amount',
        'creditNote.vat_amount AS vatAmount',
      ])
      .where('creditNote.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('creditNote.credit_note_date >= :startDate', { startDate })
      .andWhere('creditNote.credit_note_date <= :endDate', { endDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      })
      .andWhere('CAST(creditNote.vat_amount AS DECIMAL) > 0')
      .orderBy('creditNote.created_at', 'DESC');

    // Customer debit notes (for VAT Payable - output VAT)
    const vatOutputDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'debitNote.id AS debitNoteId',
        'debitNote.debit_note_date AS debitNoteDate',
        'debitNote.debit_note_number AS debitNoteNumber',
        'debitNote.customer_name AS customerName',
        'debitNote.customer_trn AS trn',
        'debitNote.amount AS amount',
        'debitNote.vat_amount AS vatAmount',
      ])
      .where('debitNote.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
      .andWhere('debitNote.debit_note_date <= :endDate', { endDate })
      .andWhere('debitNote.invoice_id IS NOT NULL') // Only customer debit notes
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      })
      .andWhere('CAST(debitNote.vat_amount AS DECIMAL) > 0')
      .orderBy('debitNote.created_at', 'DESC');

    // Supplier debit notes (for VAT Receivable - input VAT)
    const vatInputDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'debitNote.id AS debitNoteId',
        'debitNote.debit_note_date AS debitNoteDate',
        'debitNote.debit_note_number AS debitNoteNumber',
        'debitNote.vendor_name AS vendorName',
        'debitNote.vendor_trn AS trn',
        'debitNote.amount AS amount',
        'debitNote.vat_amount AS vatAmount',
      ])
      .where('debitNote.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
      .andWhere('debitNote.debit_note_date <= :endDate', { endDate })
      .andWhere('debitNote.expense_id IS NOT NULL') // Only supplier debit notes
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      })
      .andWhere('CAST(debitNote.vat_amount AS DECIMAL) > 0')
      .orderBy('debitNote.created_at', 'DESC');

    const [
      vatOutputInvoices,
      vatCreditNotes,
      vatOutputDebitNotes,
      vatInputDebitNotes,
    ] = await Promise.all([
      vatOutputQuery.getRawMany(),
      vatCreditNotesQuery.getRawMany(),
      vatOutputDebitNotesQuery.getRawMany(),
      vatInputDebitNotesQuery.getRawMany(),
    ]);

    const vatOutputItems = vatOutputInvoices.map((invoice: any) => {
      const vatAmount = parseFloat(
        invoice.vatamount || invoice.vatAmount || '0',
      );
      const amount = parseFloat(invoice.amount || '0');

      const baseAmount = amount;
      const grossAmount = amount + vatAmount;
      const vatRate =
        baseAmount > 0 ? ((vatAmount / baseAmount) * 100).toFixed(2) : '0';
      const customerName =
        invoice.customername || invoice.customerName || 'N/A';
      const trn = invoice.trn || null;

      return {
        id: invoice.invoiceid || invoice.invoiceId,
        date: invoice.invoicedate || invoice.invoiceDate,
        description:
          invoice.invoicenumber ||
          invoice.invoiceNumber ||
          customerName ||
          'Invoice',
        invoiceNumber: invoice.invoicenumber || invoice.invoiceNumber,
        customerName: customerName,
        amount: Number(baseAmount.toFixed(2)),
        grossAmount: Number(grossAmount.toFixed(2)),
        vatRate: Number(vatRate),
        vatAmount: Number(vatAmount.toFixed(2)),
        trn: trn,
        type: 'invoice',
      };
    });

    const vatCreditNoteItems = vatCreditNotes.map((creditNote: any) => {
      const vatAmount = parseFloat(
        creditNote.vatamount || creditNote.vatAmount || '0',
      );
      const amount = parseFloat(creditNote.amount || '0');

      const baseAmount = amount;
      const grossAmount = amount + vatAmount;
      const vatRate =
        baseAmount > 0 ? ((vatAmount / baseAmount) * 100).toFixed(2) : '0';
      const customerName =
        creditNote.customername || creditNote.customerName || 'N/A';
      const trn = creditNote.trn || null;

      return {
        id: creditNote.creditnoteid || creditNote.creditNoteId,
        date: creditNote.creditnotedate || creditNote.creditNoteDate,
        description:
          creditNote.creditnotenumber ||
          creditNote.creditNoteNumber ||
          customerName ||
          'Credit Note',
        creditNoteNumber:
          creditNote.creditnotenumber || creditNote.creditNoteNumber,
        customerName: customerName,
        amount: Number(baseAmount.toFixed(2)),
        grossAmount: Number(grossAmount.toFixed(2)),
        vatRate: Number(vatRate),
        vatAmount: Number(vatAmount.toFixed(2)),
        trn: trn,
        type: 'credit_note',
      };
    });

    // Customer debit notes (for VAT Output - increases VAT Payable)
    const vatOutputDebitNoteItems = vatOutputDebitNotes.map(
      (debitNote: any) => {
        const vatAmount = parseFloat(
          debitNote.vatamount || debitNote.vatAmount || '0',
        );
        const amount = parseFloat(debitNote.amount || '0');

        const baseAmount = amount;
        const grossAmount = amount + vatAmount;
        const vatRate =
          baseAmount > 0 ? ((vatAmount / baseAmount) * 100).toFixed(2) : '0';
        const customerName =
          debitNote.customername || debitNote.customerName || 'N/A';
        const trn = debitNote.trn || null;

        return {
          id: debitNote.debitnoteid || debitNote.debitNoteId,
          date: debitNote.debitnotedate || debitNote.debitNoteDate,
          description:
            debitNote.debitnotenumber ||
            debitNote.debitNoteNumber ||
            customerName ||
            'Debit Note',
          debitNoteNumber:
            debitNote.debitnotenumber || debitNote.debitNoteNumber,
          customerName: customerName,
          amount: Number(baseAmount.toFixed(2)),
          grossAmount: Number(grossAmount.toFixed(2)),
          vatRate: Number(vatRate),
          vatAmount: Number(vatAmount.toFixed(2)),
          trn: trn,
          type: 'debit_note',
        };
      },
    );

    // Supplier debit notes (for VAT Input - reduces VAT Receivable)
    const vatInputDebitNoteItems = vatInputDebitNotes.map((debitNote: any) => {
      const vatAmount = parseFloat(
        debitNote.vatamount || debitNote.vatAmount || '0',
      );
      const amount = parseFloat(debitNote.amount || '0');

      const baseAmount = amount;
      const grossAmount = amount + vatAmount;
      const vatRate =
        baseAmount > 0 ? ((vatAmount / baseAmount) * 100).toFixed(2) : '0';
      const vendorName = debitNote.vendorname || debitNote.vendorName || 'N/A';
      const trn = debitNote.trn || null;

      return {
        id: debitNote.debitnoteid || debitNote.debitNoteId,
        date: debitNote.debitnotedate || debitNote.debitNoteDate,
        description:
          debitNote.debitnotenumber ||
          debitNote.debitNoteNumber ||
          vendorName ||
          'Debit Note',
        debitNoteNumber: debitNote.debitnotenumber || debitNote.debitNoteNumber,
        vendorName: vendorName,
        amount: Number(baseAmount.toFixed(2)),
        grossAmount: Number(grossAmount.toFixed(2)),
        vatRate: Number(vatRate),
        vatAmount: Number(vatAmount.toFixed(2)),
        trn: trn,
        type: 'debit_note',
      };
    });

    // VAT Input: expenses + supplier debit notes (reduces VAT Receivable)
    const totalVatInput = vatInputItems.reduce(
      (sum, item) => sum + item.vatAmount,
      0,
    );
    const totalVatInputDebitNotes = vatInputDebitNoteItems.reduce(
      (sum, item) => sum + item.vatAmount,
      0,
    );
    const netVatInput = totalVatInput - totalVatInputDebitNotes;

    // VAT Output: invoices - credit notes + customer debit notes (increases VAT Payable)
    const totalVatOutput = vatOutputItems.reduce(
      (sum, item) => sum + item.vatAmount,
      0,
    );
    const totalVatCreditNotes = vatCreditNoteItems.reduce(
      (sum, item) => sum + item.vatAmount,
      0,
    );
    const totalVatOutputDebitNotes = vatOutputDebitNoteItems.reduce(
      (sum, item) => sum + item.vatAmount,
      0,
    );

    const netVatOutput =
      totalVatOutput - totalVatCreditNotes + totalVatOutputDebitNotes;
    const netVat = netVatOutput - netVatInput;

    return {
      startDate,
      endDate,
      vatInputItems: [...vatInputItems, ...vatInputDebitNoteItems],
      vatOutputItems: [
        ...vatOutputItems,
        ...vatCreditNoteItems,
        ...vatOutputDebitNoteItems,
      ],
      summary: {
        vatInput: Number(totalVatInput.toFixed(2)),
        vatInputDebitNotes: Number(totalVatInputDebitNotes.toFixed(2)),
        netVatInput: Number(netVatInput.toFixed(2)),
        vatOutput: Number(totalVatOutput.toFixed(2)),
        vatCreditNotes: Number(totalVatCreditNotes.toFixed(2)),
        vatOutputDebitNotes: Number(totalVatOutputDebitNotes.toFixed(2)),
        netVatOutput: Number(netVatOutput.toFixed(2)),
        netVat: Number(netVat.toFixed(2)),
        totalTransactions:
          vatInputItems.length +
          vatOutputItems.length +
          vatCreditNoteItems.length +
          vatOutputDebitNoteItems.length +
          vatInputDebitNoteItems.length,
        inputTransactions: vatInputItems.length,
        inputDebitNoteTransactions: vatInputDebitNoteItems.length,
        outputTransactions: vatOutputItems.length,
        creditNoteTransactions: vatCreditNoteItems.length,
        outputDebitNoteTransactions: vatOutputDebitNoteItems.length,
      },
    };
  }

  /**
   * Calculate closing stock value as of a specific date
   * Uses average cost method for valuation
   */
  private async calculateClosingStock(
    organizationId: string,
    asOfDate: string,
  ): Promise<number> {
    try {
      // Get all products for this organization
      const products = await this.productsRepository.find({
        where: {
          organization: { id: organizationId },
          isDeleted: false,
        },
      });

      if (products.length === 0) {
        return 0;
      }

      let totalStockValue = 0;

      // Calculate stock value for each product
      for (const product of products) {
        // Get stock quantity from movements up to asOfDate
        const stockQuery = this.stockMovementsRepository
          .createQueryBuilder('movement')
          .select(
            'COALESCE(SUM(CAST(movement.quantity AS DECIMAL)), 0)',
            'total',
          )
          .where('movement.product_id = :productId', { productId: product.id })
          .andWhere('movement.organization_id = :organizationId', {
            organizationId,
          })
          .andWhere('movement.is_deleted = false')
          .andWhere('movement.created_at::date <= :asOfDate', { asOfDate });

        const stockResult = await stockQuery.getRawOne();
        const stockQuantity = parseFloat(stockResult?.total || '0');

        if (stockQuantity > 0) {
          // Use average cost for valuation (FIFO/LIFO can be added later)
          let costPerUnit = 0;

          if (product.averageCost) {
            costPerUnit = parseFloat(product.averageCost);
          } else if (product.costPrice) {
            costPerUnit = parseFloat(product.costPrice);
          } else {
            // Calculate average cost from purchase movements
            const purchaseMovementsQuery = this.stockMovementsRepository
              .createQueryBuilder('movement')
              .select([
                'SUM(CAST(movement.quantity AS DECIMAL)) AS totalQty',
                'SUM(CAST(movement.total_cost AS DECIMAL)) AS totalCost',
              ])
              .where('movement.product_id = :productId', {
                productId: product.id,
              })
              .andWhere('movement.organization_id = :organizationId', {
                organizationId,
              })
              .andWhere('movement.movement_type = :type', {
                type: StockMovementType.PURCHASE,
              })
              .andWhere('movement.is_deleted = false')
              .andWhere('movement.created_at::date <= :asOfDate', { asOfDate });

            const purchaseResult = await purchaseMovementsQuery.getRawOne();
            const totalQty = parseFloat(purchaseResult?.totalQty || '0');
            const totalCost = parseFloat(purchaseResult?.totalCost || '0');

            if (totalQty > 0) {
              costPerUnit = totalCost / totalQty;
            }
          }

          const productStockValue = stockQuantity * costPerUnit;
          totalStockValue += productStockValue;
        }
      }

      return Math.round(totalStockValue * 100) / 100;
    } catch (error) {
      this.logger.error(
        `Error calculating closing stock: organizationId=${organizationId}, error=${error.message}`,
        error.stack,
      );
      // Return 0 on error to not break the Balance Sheet
      return 0;
    }
  }

  /**
   * Build Stock Balance Report
   * Shows stock inwards, outwards, adjustments, and balance for each product
   */
  private async buildStockBalanceReport(
    organizationId: string,
    filters?: Record<string, any>,
  ): Promise<{
    products: Array<{
      productId: string;
      productName: string;
      sku?: string;
      unitOfMeasure?: string;
      openingStock: number;
      stockInwards: number;
      stockOutwards: number;
      adjustments: number;
      closingStock: number;
      averageCost: number;
      stockValue: number;
    }>;
    summary: {
      totalOpeningStock: number;
      totalStockInwards: number;
      totalStockOutwards: number;
      totalAdjustments: number;
      totalClosingStock: number;
      totalStockValue: number;
    };
    period: {
      startDate?: string;
      endDate?: string;
    };
  }> {
    this.logger.log(
      `Building Stock Balance Report: organizationId=${organizationId}, filters=${JSON.stringify(filters)}`,
    );

    try {
      const startDate = filters?.startDate
        ? new Date(filters.startDate).toISOString().split('T')[0]
        : undefined;
      const endDate = filters?.endDate
        ? new Date(filters.endDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      // Get all products for this organization
      const products = await this.productsRepository.find({
        where: {
          organization: { id: organizationId },
          isDeleted: false,
        },
        order: { name: 'ASC' },
      });

      if (products.length === 0) {
        this.logger.debug('No products found for stock balance report');
        return {
          products: [],
          summary: {
            totalOpeningStock: 0,
            totalStockInwards: 0,
            totalStockOutwards: 0,
            totalAdjustments: 0,
            totalClosingStock: 0,
            totalStockValue: 0,
          },
          period: { startDate, endDate },
        };
      }

      const productReports: Array<{
        productId: string;
        productName: string;
        sku?: string;
        unitOfMeasure?: string;
        openingStock: number;
        stockInwards: number;
        stockOutwards: number;
        adjustments: number;
        closingStock: number;
        averageCost: number;
        stockValue: number;
      }> = [];

      let totalOpeningStock = 0;
      let totalStockInwards = 0;
      let totalStockOutwards = 0;
      let totalAdjustments = 0;
      let totalClosingStock = 0;
      let totalStockValue = 0;

      for (const product of products) {
        // Calculate opening stock (as of start date, or 0 if no start date)
        let openingStock = 0;
        if (startDate) {
          const openingQuery = this.stockMovementsRepository
            .createQueryBuilder('movement')
            .select(
              'COALESCE(SUM(CAST(movement.quantity AS DECIMAL)), 0)',
              'total',
            )
            .where('movement.product_id = :productId', {
              productId: product.id,
            })
            .andWhere('movement.organization_id = :organizationId', {
              organizationId,
            })
            .andWhere('movement.is_deleted = false')
            .andWhere('movement.created_at::date < :startDate', { startDate });

          const openingResult = await openingQuery.getRawOne();
          openingStock = parseFloat(openingResult?.total || '0');
        }

        // Calculate stock inwards (PURCHASE movements in period)
        const inwardsQuery = this.stockMovementsRepository
          .createQueryBuilder('movement')
          .select(
            'COALESCE(SUM(CAST(movement.quantity AS DECIMAL)), 0)',
            'total',
          )
          .where('movement.product_id = :productId', { productId: product.id })
          .andWhere('movement.organization_id = :organizationId', {
            organizationId,
          })
          .andWhere('movement.movement_type = :type', {
            type: StockMovementType.PURCHASE,
          })
          .andWhere('movement.is_deleted = false');

        if (startDate) {
          inwardsQuery.andWhere('movement.created_at::date >= :startDate', {
            startDate,
          });
        }
        if (endDate) {
          inwardsQuery.andWhere('movement.created_at::date <= :endDate', {
            endDate,
          });
        }

        const inwardsResult = await inwardsQuery.getRawOne();
        const stockInwards = parseFloat(inwardsResult?.total || '0');

        // Calculate stock outwards (SALE movements in period)
        const outwardsQuery = this.stockMovementsRepository
          .createQueryBuilder('movement')
          .select(
            'COALESCE(SUM(ABS(CAST(movement.quantity AS DECIMAL))), 0)',
            'total',
          )
          .where('movement.product_id = :productId', { productId: product.id })
          .andWhere('movement.organization_id = :organizationId', {
            organizationId,
          })
          .andWhere('movement.movement_type = :type', {
            type: StockMovementType.SALE,
          })
          .andWhere('movement.is_deleted = false');

        if (startDate) {
          outwardsQuery.andWhere('movement.created_at::date >= :startDate', {
            startDate,
          });
        }
        if (endDate) {
          outwardsQuery.andWhere('movement.created_at::date <= :endDate', {
            endDate,
          });
        }

        const outwardsResult = await outwardsQuery.getRawOne();
        const stockOutwards = parseFloat(outwardsResult?.total || '0');

        // Calculate adjustments (ADJUSTMENT movements in period)
        const adjustmentsQuery = this.stockMovementsRepository
          .createQueryBuilder('movement')
          .select(
            'COALESCE(SUM(CAST(movement.quantity AS DECIMAL)), 0)',
            'total',
          )
          .where('movement.product_id = :productId', { productId: product.id })
          .andWhere('movement.organization_id = :organizationId', {
            organizationId,
          })
          .andWhere('movement.movement_type = :type', {
            type: StockMovementType.ADJUSTMENT,
          })
          .andWhere('movement.is_deleted = false');

        if (startDate) {
          adjustmentsQuery.andWhere('movement.created_at::date >= :startDate', {
            startDate,
          });
        }
        if (endDate) {
          adjustmentsQuery.andWhere('movement.created_at::date <= :endDate', {
            endDate,
          });
        }

        const adjustmentsResult = await adjustmentsQuery.getRawOne();
        const adjustments = parseFloat(adjustmentsResult?.total || '0');

        // Calculate closing stock (as of end date)
        const closingQuery = this.stockMovementsRepository
          .createQueryBuilder('movement')
          .select(
            'COALESCE(SUM(CAST(movement.quantity AS DECIMAL)), 0)',
            'total',
          )
          .where('movement.product_id = :productId', { productId: product.id })
          .andWhere('movement.organization_id = :organizationId', {
            organizationId,
          })
          .andWhere('movement.is_deleted = false')
          .andWhere('movement.created_at::date <= :endDate', { endDate });

        const closingResult = await closingQuery.getRawOne();
        const closingStock = parseFloat(closingResult?.total || '0');

        // Calculate average cost per unit
        let averageCost = 0;
        if (product.averageCost) {
          averageCost = parseFloat(product.averageCost);
        } else if (product.costPrice) {
          averageCost = parseFloat(product.costPrice);
        } else {
          // Calculate from purchase movements up to end date
          const costQuery = this.stockMovementsRepository
            .createQueryBuilder('movement')
            .select([
              'SUM(CAST(movement.quantity AS DECIMAL)) AS totalQty',
              'SUM(CAST(movement.total_cost AS DECIMAL)) AS totalCost',
            ])
            .where('movement.product_id = :productId', {
              productId: product.id,
            })
            .andWhere('movement.organization_id = :organizationId', {
              organizationId,
            })
            .andWhere('movement.movement_type = :type', {
              type: StockMovementType.PURCHASE,
            })
            .andWhere('movement.is_deleted = false')
            .andWhere('movement.created_at::date <= :endDate', { endDate });

          const costResult = await costQuery.getRawOne();
          const totalQty = parseFloat(costResult?.totalQty || '0');
          const totalCost = parseFloat(costResult?.totalCost || '0');

          if (totalQty > 0) {
            averageCost = totalCost / totalQty;
          }
        }

        // Calculate stock value
        const stockValue = closingStock * averageCost;

        // Only include products with any stock activity or current stock
        if (
          openingStock !== 0 ||
          stockInwards !== 0 ||
          stockOutwards !== 0 ||
          adjustments !== 0 ||
          closingStock !== 0
        ) {
          productReports.push({
            productId: product.id,
            productName: product.name,
            sku: product.sku || undefined,
            unitOfMeasure: product.unitOfMeasure || undefined,
            openingStock: Math.round(openingStock * 100) / 100,
            stockInwards: Math.round(stockInwards * 100) / 100,
            stockOutwards: Math.round(stockOutwards * 100) / 100,
            adjustments: Math.round(adjustments * 100) / 100,
            closingStock: Math.round(closingStock * 100) / 100,
            averageCost: Math.round(averageCost * 100) / 100,
            stockValue: Math.round(stockValue * 100) / 100,
          });

          totalOpeningStock += openingStock;
          totalStockInwards += stockInwards;
          totalStockOutwards += stockOutwards;
          totalAdjustments += adjustments;
          totalClosingStock += closingStock;
          totalStockValue += stockValue;
        }
      }

      // Round totals
      totalOpeningStock = Math.round(totalOpeningStock * 100) / 100;
      totalStockInwards = Math.round(totalStockInwards * 100) / 100;
      totalStockOutwards = Math.round(totalStockOutwards * 100) / 100;
      totalAdjustments = Math.round(totalAdjustments * 100) / 100;
      totalClosingStock = Math.round(totalClosingStock * 100) / 100;
      totalStockValue = Math.round(totalStockValue * 100) / 100;

      this.logger.debug(
        `Stock Balance Report built: products=${productReports.length}, totalStockValue=${totalStockValue}, organizationId=${organizationId}`,
      );

      return {
        products: productReports,
        summary: {
          totalOpeningStock,
          totalStockInwards,
          totalStockOutwards,
          totalAdjustments,
          totalClosingStock,
          totalStockValue,
        },
        period: { startDate, endDate },
      };
    } catch (error) {
      this.logger.error(
        `Error building stock balance report: organizationId=${organizationId}, error=${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
