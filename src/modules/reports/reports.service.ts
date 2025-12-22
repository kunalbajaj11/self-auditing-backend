import { Injectable } from '@nestjs/common';
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
import { GenerateReportDto } from './dto/generate-report.dto';
import { ReportHistoryFilterDto } from './dto/report-history-filter.dto';
import { ReportType } from '../../common/enums/report-type.enum';
import { AccrualStatus } from '../../common/enums/accrual-status.enum';
import { PaymentStatus } from '../../common/enums/payment-status.enum';
import { CreditNoteStatus } from '../../common/enums/credit-note-status.enum';
import { DebitNoteStatus } from '../../common/enums/debit-note-status.enum';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class ReportsService {
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
    private readonly settingsService: SettingsService,
  ) {}

  async listHistory(
    organizationId: string,
    filters: ReportHistoryFilterDto,
  ): Promise<Report[]> {
    const query = this.reportsRepository
      .createQueryBuilder('report')
      .where('report.organization_id = :organizationId', { organizationId });
    if (filters.type) {
      query.andWhere('report.type = :type', { type: filters.type });
    }
    query.orderBy('report.created_at', 'DESC');
    return query.getMany();
  }

  async findById(id: string, organizationId: string): Promise<Report | null> {
    return this.reportsRepository.findOne({
      where: {
        id,
        organization: { id: organizationId },
      },
    });
  }

  async getFilterOptions(organizationId: string): Promise<{
    vendors: string[];
    categories: string[];
  }> {
    // Get unique vendor names
    const vendorResults = await this.expensesRepository
      .createQueryBuilder('expense')
      .select('DISTINCT expense.vendor_name', 'vendorName')
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.vendor_name IS NOT NULL')
      .andWhere("expense.vendor_name != ''")
      .orderBy('expense.vendor_name', 'ASC')
      .getRawMany();

    return {
      // Note: Raw SQL queries return lowercase column names in PostgreSQL
      vendors: vendorResults
        .map((r) => r.vendorname || r.vendorName)
        .filter((v) => v)
        .sort(),
      categories: [], // Can be populated if needed
    };
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
    let data: any = null;
    let summary: any = null;

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
      default:
        data = {};
    }

    // Extract summary from data if it exists
    if (data && typeof data === 'object' && 'summary' in data) {
      summary = data.summary;
    }

    const record = this.reportsRepository.create({
      organization: { id: organizationId } as any,
      type: dto.type,
      filters: dto.filters ?? {},
      generatedBy: { id: userId } as any,
    });
    await this.reportsRepository.save(record);

    return { type: dto.type, generatedAt: new Date(), data, summary };
  }

  /**
   * Trial Balance Report
   * Lists all accounts with their debit and credit balances
   * Includes: Expenses, Revenue, Accounts Payable, Accounts Receivable, VAT accounts, Cash/Bank, Journal Entries
   */
  private async buildTrialBalance(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    let startDate = filters?.['startDate'];
    let endDate = filters?.['endDate'];
    
    // If dates not provided, use fiscal year based on tax year end
    if (!startDate || !endDate) {
      const taxSettings = await this.settingsService.getTaxSettings(organizationId);
      const taxYearEnd = taxSettings.taxYearEnd; // Format: "MM-DD" (e.g., "12-31")
      
      if (taxYearEnd) {
        const [month, day] = taxYearEnd.split('-').map(Number);
        const now = new Date();
        const currentYear = now.getFullYear();
        const fiscalYearEnd = new Date(currentYear, month - 1, day);
        
        // If fiscal year end has passed this year, use current fiscal year
        // Otherwise, use previous fiscal year
        if (now > fiscalYearEnd) {
          // Current fiscal year: from last year's fiscal year end + 1 day to this year's fiscal year end
          startDate = new Date(currentYear - 1, month - 1, day + 1).toISOString().split('T')[0];
          endDate = fiscalYearEnd.toISOString().split('T')[0];
        } else {
          // Previous fiscal year: from year before last's fiscal year end + 1 day to last year's fiscal year end
          startDate = new Date(currentYear - 2, month - 1, day + 1).toISOString().split('T')[0];
          endDate = new Date(currentYear - 1, month - 1, day).toISOString().split('T')[0];
        }
      } else {
        // Fallback to calendar year
        startDate = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
        endDate = new Date().toISOString().split('T')[0];
      }
    }

    const accounts: Array<{
      accountName: string;
      accountType: string;
      debit: number;
      credit: number;
      balance: number;
    }> = [];

    // 1. Get expenses grouped by category (debits)
    // Exclude type='credit' expenses as they are sales/revenue, not expenses
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

    // Apply type filter if provided
    if (filters?.['type']) {
      const types = Array.isArray(filters.type)
        ? filters.type
        : [filters.type];
      expenseQuery.andWhere('expense.type IN (:...types)', { types });
    }

    const expenseRows = await expenseQuery.getRawMany();
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

    // 2. Get sales invoices revenue (credits)
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

    // Apply status filter if provided
    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      revenueQuery.andWhere('invoice.status IN (:...statuses)', { statuses });
    }

    const revenueRow = await revenueQuery.getRawOne();
    const revenueCredit = Number(revenueRow?.credit || 0);

    // 2a. Get Credit Notes (reduce revenue) - Debits (reduce revenue account)
    const creditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select([
        'SUM(COALESCE(creditNote.base_amount, creditNote.amount)) AS amount',
      ])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date >= :startDate', { startDate })
      .andWhere('creditNote.credit_note_date <= :endDate', { endDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      });

    const creditNotesRow = await creditNotesQuery.getRawOne();
    const creditNotesAmount = Number(creditNotesRow?.amount || 0);

    // 2b. Get Debit Notes (increase revenue) - Credits (increase revenue account)
    const debitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'SUM(COALESCE(debitNote.base_amount, debitNote.amount)) AS amount',
      ])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
      .andWhere('debitNote.debit_note_date <= :endDate', { endDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    const debitNotesRow = await debitNotesQuery.getRawOne();
    const debitNotesAmount = Number(debitNotesRow?.amount || 0);

    // For Revenue account: Credits increase (invoices + debit notes), Debits decrease (credit notes)
    // Balance = Credits - Debits
    const revenueDebit = creditNotesAmount; // Credit notes reduce revenue (debit)
    const totalRevenueCredit = revenueCredit + debitNotesAmount; // Invoices and debit notes increase revenue (credit)
    const revenueBalance = totalRevenueCredit - revenueDebit;

    // Always add Sales Revenue account (even if 0) so it appears in the report
    accounts.push({
      accountName: 'Sales Revenue',
      accountType: 'Revenue',
      debit: revenueDebit,
      credit: totalRevenueCredit,
      balance: revenueBalance,
    });

    // 3. Get Accounts Payable (unpaid accruals as of end date) - Credits (liabilities)
    // Show all unpaid accruals that exist as of the end date
    const accrualsQuery = this.accrualsRepository
      .createQueryBuilder('accrual')
      .select([
        "'Accounts Payable' AS accountName",
        "'Liability' AS accountType",
        '0 AS debit',
        'SUM(accrual.amount) AS credit',
      ])
      .where('accrual.organization_id = :organizationId', { organizationId })
      .andWhere('accrual.is_deleted = false')
      .andWhere('accrual.status = :status', { status: AccrualStatus.PENDING_SETTLEMENT })
      .andWhere('accrual.created_at::date <= :endDate', { endDate });

    const accrualsRow = await accrualsQuery.getRawOne();
    const accrualsCredit = Number(accrualsRow?.credit || 0);
    // For liability accounts, balance = credit - debit (positive = credit balance)
    const accrualsBalance = accrualsCredit - 0; // credit - debit
    // Always add Accounts Payable account, even if 0, so it appears in the report
    accounts.push({
      accountName: 'Accounts Payable',
      accountType: 'Liability',
      debit: 0,
      credit: accrualsCredit,
      balance: accrualsBalance,
    });

    // 4. Get Accounts Receivable (unpaid invoices as of end date) - Debits (assets)
    // Show all unpaid/partial invoices that exist as of the end date
    // Credit Notes reduce receivables, Debit Notes increase receivables
    const receivablesQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        'SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0)) AS invoiceAmount',
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date <= :endDate', { endDate })
      .andWhere('invoice.payment_status IN (:...statuses)', {
        statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
      });

    const receivablesRow = await receivablesQuery.getRawOne();
    const receivablesDebit = Number(receivablesRow?.invoiceAmount || 0);

    // Get Credit Notes that reduce receivables (as of end date)
    const receivablesCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select([
        'SUM(COALESCE(creditNote.total_amount, 0)) AS credit',
      ])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date <= :endDate', { endDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      });

    const receivablesCreditNotesRow = await receivablesCreditNotesQuery.getRawOne();
    const receivablesCreditNotesCredit = Number(receivablesCreditNotesRow?.credit || 0);

    // Get Debit Notes that increase receivables (as of end date)
    const receivablesDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'SUM(COALESCE(debitNote.total_amount, 0)) AS debit',
      ])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date <= :endDate', { endDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    const receivablesDebitNotesRow = await receivablesDebitNotesQuery.getRawOne();
    const receivablesDebitNotesDebit = Number(receivablesDebitNotesRow?.debit || 0);

    // Net Accounts Receivable = Invoices - Credit Notes + Debit Notes
    const netReceivablesDebit = receivablesDebit + receivablesDebitNotesDebit;
    const netReceivablesCredit = receivablesCreditNotesCredit;
    const netReceivablesBalance = netReceivablesDebit - netReceivablesCredit;

    // Always add Accounts Receivable account (even if 0) so it appears in the report
    accounts.push({
      accountName: 'Accounts Receivable',
      accountType: 'Asset',
      debit: netReceivablesDebit,
      credit: netReceivablesCredit,
      balance: netReceivablesBalance,
    });

    // 5. Get VAT Receivable (Input VAT from expenses) - Debits (Asset)
    // Input VAT on purchases/expenses is an asset (you can claim it back)
    // Exclude type='credit' expenses as they are sales/revenue, not expenses
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
    if (vatReceivableDebit > 0) {
      accounts.push({
        accountName: 'VAT Receivable (Input VAT)',
        accountType: 'Asset',
        debit: vatReceivableDebit,
        credit: 0,
        balance: vatReceivableDebit,
      });
    }

    // 6. Get VAT Payable (Output VAT from sales invoices) - Credits (Liability)
    // Output VAT on sales is a liability (you owe it to the tax authority)
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
      vatPayableQuery.andWhere('invoice.status IN (:...statuses)', { statuses });
    }

    const vatPayableRow = await vatPayableQuery.getRawOne();
    const vatPayableCredit = Number(vatPayableRow?.credit || 0);

    // 6a. Get VAT from Credit Notes (reduce VAT Payable) - Debits
    const vatCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select([
        'SUM(COALESCE(creditNote.vat_amount, 0)) AS debit',
      ])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date >= :startDate', { startDate })
      .andWhere('creditNote.credit_note_date <= :endDate', { endDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      })
      .andWhere('creditNote.vat_amount > 0');

    const vatCreditNotesRow = await vatCreditNotesQuery.getRawOne();
    const vatCreditNotesDebit = Number(vatCreditNotesRow?.debit || 0);

    // 6b. Get VAT from Debit Notes (increase VAT Payable) - Credits
    const vatDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'SUM(COALESCE(debitNote.vat_amount, 0)) AS credit',
      ])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
      .andWhere('debitNote.debit_note_date <= :endDate', { endDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      })
      .andWhere('debitNote.vat_amount > 0');

    const vatDebitNotesRow = await vatDebitNotesQuery.getRawOne();
    const vatDebitNotesCredit = Number(vatDebitNotesRow?.credit || 0);

    // Net VAT Payable = Output VAT - Credit Note VAT + Debit Note VAT
    // For liability accounts: Credit increases, Debit decreases
    // Output VAT = credit, Credit Note VAT = debit (reduces), Debit Note VAT = credit (increases)
    const netVatPayableDebit = vatCreditNotesDebit;
    const netVatPayableCredit = vatPayableCredit + vatDebitNotesCredit;

    // Always add VAT Payable account (even if 0) so it appears in the report
    // For liability accounts, balance = credit - debit
    accounts.push({
      accountName: 'VAT Payable (Output VAT)',
      accountType: 'Liability',
      debit: netVatPayableDebit,
      credit: netVatPayableCredit,
      balance: netVatPayableCredit - netVatPayableDebit,
    });

    // 7. Get Cash/Bank Account - Combined receipts and payments
    // Cash/Bank is an asset account: receipts are debits (increase), payments are credits (decrease)
    const expensePaymentsQuery = this.expensePaymentsRepository
      .createQueryBuilder('payment')
      .select([
        'SUM(COALESCE(payment.amount, 0)) AS payments',
      ])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date >= :startDate', { startDate })
      .andWhere('payment.payment_date <= :endDate', { endDate });

    const expensePaymentsRow = await expensePaymentsQuery.getRawOne();
    const expensePaymentsCredit = Number(expensePaymentsRow?.payments || 0);

    const invoicePaymentsQuery = this.invoicePaymentsRepository
      .createQueryBuilder('payment')
      .select([
        'SUM(COALESCE(payment.amount, 0)) AS receipts',
      ])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date >= :startDate', { startDate })
      .andWhere('payment.payment_date <= :endDate', { endDate });

    const invoicePaymentsRow = await invoicePaymentsQuery.getRawOne();
    const invoicePaymentsDebit = Number(invoicePaymentsRow?.receipts || 0);

    // Include journal entries with CASH_PAID, CASH_RECEIVED, BANK_PAID, and BANK_RECEIVED statuses
    // Cash/Bank is a combined account, so we include both cash and bank journal entries
    const cashBankJournalEntriesQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select([
        "SUM(CASE WHEN entry.status IN ('cash_received', 'bank_received') THEN entry.amount ELSE 0 END) AS received",
        "SUM(CASE WHEN entry.status IN ('cash_paid', 'bank_paid') THEN entry.amount ELSE 0 END) AS paid",
      ])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date >= :startDate', { startDate })
      .andWhere('entry.entry_date <= :endDate', { endDate })
      .andWhere("entry.status IN ('cash_paid', 'cash_received', 'bank_paid', 'bank_received')");

    const cashBankJournalEntriesRow = await cashBankJournalEntriesQuery.getRawOne();
    const journalReceivedDebit = Number(cashBankJournalEntriesRow?.received || 0);
    const journalPaidCredit = Number(cashBankJournalEntriesRow?.paid || 0);

    // Total debits = invoice payments + cash/bank received from journal entries
    // Total credits = expense payments + cash/bank paid from journal entries
    const totalCashDebit = invoicePaymentsDebit + journalReceivedDebit;
    const totalCashCredit = expensePaymentsCredit + journalPaidCredit;

    // Always add Cash/Bank account (even if 0) so it appears in the report
    // The opening balance will be calculated separately and combined with period transactions
    accounts.push({
      accountName: 'Cash/Bank',
      accountType: 'Asset',
      debit: totalCashDebit,
      credit: totalCashCredit,
      balance: totalCashDebit - totalCashCredit,
    });

    // 9. Get Journal Entries (excluding cash/bank entries which are already included in Cash/Bank account)
    // Journal entries: equity types (share_capital, retained_earnings) are typically credits
    // shareholder_account entries are typically debits
    // CASH_PAID and CASH_RECEIVED are excluded here as they're included in Cash/Bank account
    // BANK_PAID and BANK_RECEIVED should be handled similarly if there's a Bank account
    const journalEntriesQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select([
        "CASE WHEN entry.category = 'equity' THEN 'Equity - ' || entry.type::text ELSE 'Other - ' || entry.category::text END AS accountName",
        "CASE WHEN entry.category = 'equity' THEN 'Equity' ELSE 'Journal Entry' END AS accountType",
        "SUM(CASE WHEN entry.type = 'shareholder_account' THEN entry.amount ELSE 0 END) AS debit",
        "SUM(CASE WHEN entry.type IN ('share_capital', 'retained_earnings') THEN entry.amount ELSE 0 END) AS credit",
      ])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date >= :startDate', { startDate })
      .andWhere('entry.entry_date <= :endDate', { endDate })
      .andWhere("entry.status NOT IN ('cash_paid', 'cash_received', 'bank_paid', 'bank_received')")
      .groupBy('entry.category')
      .addGroupBy('entry.type');

    const journalRows = await journalEntriesQuery.getRawMany();
    journalRows.forEach((row) => {
      const debit = Number(row.debit || 0);
      const credit = Number(row.credit || 0);
      if (debit > 0 || credit > 0) {
        const accountType = row.accounttype || 'Journal Entry';
        // For credit accounts (Equity, Revenue, Liabilities): balance = credit - debit
        // For debit accounts (Assets, Expenses): balance = debit - credit
        const isCreditAccount = accountType === 'Equity' || accountType === 'Revenue' || accountType === 'Liability';
        const balance = isCreditAccount ? credit - debit : debit - credit;
        
        accounts.push({
          accountName: row.accountname || 'Journal Entry',
          accountType: accountType,
          debit,
          credit,
          balance: balance,
        });
      }
    });

    // Calculate opening balances (before startDate) for each account
    const openingBalances = new Map<string, { debit: number; credit: number; balance: number }>();

    // 1. Opening balances for expenses by category
    // Exclude type='credit' expenses as they are sales/revenue, not expenses
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
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      openingExpenseQuery.andWhere('expense.type IN (:...types)', { types });
    }

    const openingExpenseRows = await openingExpenseQuery.getRawMany();
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

    // 2. Opening balance for Sales Revenue (including Credit Notes and Debit Notes)
    const openingRevenueQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        'SUM(COALESCE(invoice.base_amount, invoice.amount)) AS credit',
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date < :startDate', { startDate });

    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      openingRevenueQuery.andWhere('invoice.status IN (:...statuses)', { statuses });
    }

    const openingRevenueRow = await openingRevenueQuery.getRawOne();
    const openingRevenueCredit = Number(openingRevenueRow?.credit || 0);

    // Opening Credit Notes (reduce revenue) - Debits
    const openingCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select([
        'SUM(COALESCE(creditNote.base_amount, creditNote.amount)) AS amount',
      ])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date < :startDate', { startDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      });

    const openingCreditNotesRow = await openingCreditNotesQuery.getRawOne();
    const openingCreditNotesAmount = Number(openingCreditNotesRow?.amount || 0);

    // Opening Debit Notes (increase revenue) - Credits
    const openingDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'SUM(COALESCE(debitNote.base_amount, debitNote.amount)) AS amount',
      ])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date < :startDate', { startDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    const openingDebitNotesRow = await openingDebitNotesQuery.getRawOne();
    const openingDebitNotesAmount = Number(openingDebitNotesRow?.amount || 0);

    // For Revenue account: Credits increase (invoices + debit notes), Debits decrease (credit notes)
    // Balance = Credits - Debits
    const openingRevenueDebit = openingCreditNotesAmount; // Credit notes reduce revenue (debit)
    const totalOpeningRevenueCredit = openingRevenueCredit + openingDebitNotesAmount; // Invoices and debit notes increase revenue (credit)
    const openingRevenueBalance = totalOpeningRevenueCredit - openingRevenueDebit;
    // Always set opening balance for Sales Revenue, even if 0
    openingBalances.set('Sales Revenue', {
      debit: openingRevenueDebit,
      credit: totalOpeningRevenueCredit,
      balance: openingRevenueBalance,
    });

    // 3. Opening balance for Accounts Payable (accruals before startDate that are still pending)
    // Include all pending accruals that existed before the start date
    const openingAccrualsQuery = this.accrualsRepository
      .createQueryBuilder('accrual')
      .select([
        'SUM(accrual.amount) AS credit',
      ])
      .where('accrual.organization_id = :organizationId', { organizationId })
      .andWhere('accrual.is_deleted = false')
      .andWhere('accrual.status = :status', { status: AccrualStatus.PENDING_SETTLEMENT })
      .andWhere('accrual.created_at::date < :startDate', { startDate });

    const openingAccrualsRow = await openingAccrualsQuery.getRawOne();
    const openingAccrualsCredit = Number(openingAccrualsRow?.credit || 0);
    // For liability accounts, balance = credit - debit (positive = credit balance)
    const openingAccrualsBalance = openingAccrualsCredit - 0; // credit - debit
    // Always set opening balance for Accounts Payable, even if 0, so it appears in the report
    openingBalances.set('Accounts Payable', {
      debit: 0,
      credit: openingAccrualsCredit,
      balance: openingAccrualsBalance,
    });

    // 4. Opening balance for Accounts Receivable (invoices before startDate that are still unpaid)
    // Include Credit Notes and Debit Notes that affect receivables
    const openingReceivablesQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        'SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0)) AS invoiceAmount',
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date < :startDate', { startDate })
      .andWhere('invoice.payment_status IN (:...statuses)', {
        statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
      });

    const openingReceivablesRow = await openingReceivablesQuery.getRawOne();
    const openingReceivablesDebit = Number(openingReceivablesRow?.invoiceAmount || 0);

    // Opening Credit Notes (reduce receivables)
    const openingReceivablesCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select([
        'SUM(COALESCE(creditNote.total_amount, 0)) AS credit',
      ])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date < :startDate', { startDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      });

    const openingReceivablesCreditNotesRow = await openingReceivablesCreditNotesQuery.getRawOne();
    const openingReceivablesCreditNotesCredit = Number(openingReceivablesCreditNotesRow?.credit || 0);

    // Opening Debit Notes (increase receivables)
    const openingReceivablesDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'SUM(COALESCE(debitNote.total_amount, 0)) AS debit',
      ])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date < :startDate', { startDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    const openingReceivablesDebitNotesRow = await openingReceivablesDebitNotesQuery.getRawOne();
    const openingReceivablesDebitNotesDebit = Number(openingReceivablesDebitNotesRow?.debit || 0);

    // Net opening Accounts Receivable = Invoices - Credit Notes + Debit Notes
    const netOpeningReceivablesDebit = openingReceivablesDebit + openingReceivablesDebitNotesDebit;
    const netOpeningReceivablesCredit = openingReceivablesCreditNotesCredit;
    // Always set opening balance for Accounts Receivable, even if 0
    openingBalances.set('Accounts Receivable', {
      debit: netOpeningReceivablesDebit,
      credit: netOpeningReceivablesCredit,
      balance: netOpeningReceivablesDebit - netOpeningReceivablesCredit,
    });

    // 5. Opening balance for VAT Receivable
    // Exclude type='credit' expenses as they are sales/revenue, not expenses
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
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      openingVatReceivableQuery.andWhere('expense.type IN (:...types)', { types });
    }

    const openingVatReceivableRow = await openingVatReceivableQuery.getRawOne();
    const openingVatReceivableDebit = Number(openingVatReceivableRow?.debit || 0);
    if (openingVatReceivableDebit > 0) {
      openingBalances.set('VAT Receivable (Input VAT)', {
        debit: openingVatReceivableDebit,
        credit: 0,
        balance: openingVatReceivableDebit,
      });
    }

    // 6. Opening balance for VAT Payable (including Credit Notes and Debit Notes VAT)
    const openingVatPayableQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        'SUM(COALESCE(invoice.vat_amount, 0)) AS credit',
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date < :startDate', { startDate })
      .andWhere('invoice.vat_amount > 0');

    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      openingVatPayableQuery.andWhere('invoice.status IN (:...statuses)', { statuses });
    }

    const openingVatPayableRow = await openingVatPayableQuery.getRawOne();
    const openingVatPayableCredit = Number(openingVatPayableRow?.credit || 0);

    // Opening Credit Notes VAT (reduce VAT Payable)
    const openingVatCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select([
        'SUM(COALESCE(creditNote.vat_amount, 0)) AS debit',
      ])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date < :startDate', { startDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      })
      .andWhere('creditNote.vat_amount > 0');

    const openingVatCreditNotesRow = await openingVatCreditNotesQuery.getRawOne();
    const openingVatCreditNotesDebit = Number(openingVatCreditNotesRow?.debit || 0);

    // Opening Debit Notes VAT (increase VAT Payable)
    const openingVatDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'SUM(COALESCE(debitNote.vat_amount, 0)) AS credit',
      ])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date < :startDate', { startDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      })
      .andWhere('debitNote.vat_amount > 0');

    const openingVatDebitNotesRow = await openingVatDebitNotesQuery.getRawOne();
    const openingVatDebitNotesCredit = Number(openingVatDebitNotesRow?.credit || 0);

    // Net opening VAT Payable = Output VAT - Credit Note VAT + Debit Note VAT
    // For liability accounts: Credit increases, Debit decreases
    const netOpeningVatPayableDebit = openingVatCreditNotesDebit;
    const netOpeningVatPayableCredit = openingVatPayableCredit + openingVatDebitNotesCredit;
    // Always set opening balance for VAT Payable, even if 0
    // For liability accounts, balance = credit - debit
    openingBalances.set('VAT Payable (Output VAT)', {
      debit: netOpeningVatPayableDebit,
      credit: netOpeningVatPayableCredit,
      balance: netOpeningVatPayableCredit - netOpeningVatPayableDebit,
    });

    // 7. Opening balance for Cash/Bank - Combined receipts and payments
    // Calculate net opening balance: all receipts (debits) minus all payments (credits) before startDate
    const openingExpensePaymentsQuery = this.expensePaymentsRepository
      .createQueryBuilder('payment')
      .select([
        'SUM(COALESCE(payment.amount, 0)) AS payments',
      ])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date < :startDate', { startDate });

    const openingExpensePaymentsRow = await openingExpensePaymentsQuery.getRawOne();
    const openingExpensePaymentsCredit = Number(openingExpensePaymentsRow?.payments || 0);

    const openingInvoicePaymentsQuery = this.invoicePaymentsRepository
      .createQueryBuilder('payment')
      .select([
        'SUM(COALESCE(payment.amount, 0)) AS receipts',
      ])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date < :startDate', { startDate });

    const openingInvoicePaymentsRow = await openingInvoicePaymentsQuery.getRawOne();
    const openingInvoicePaymentsDebit = Number(openingInvoicePaymentsRow?.receipts || 0);

    // Include opening journal entries with CASH_PAID, CASH_RECEIVED, BANK_PAID, and BANK_RECEIVED statuses
    const openingCashBankJournalEntriesQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select([
        "SUM(CASE WHEN entry.status IN ('cash_received', 'bank_received') THEN entry.amount ELSE 0 END) AS received",
        "SUM(CASE WHEN entry.status IN ('cash_paid', 'bank_paid') THEN entry.amount ELSE 0 END) AS paid",
      ])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date < :startDate', { startDate })
      .andWhere("entry.status IN ('cash_paid', 'cash_received', 'bank_paid', 'bank_received')");

    const openingCashBankJournalEntriesRow = await openingCashBankJournalEntriesQuery.getRawOne();
    const openingJournalReceivedDebit = Number(openingCashBankJournalEntriesRow?.received || 0);
    const openingJournalPaidCredit = Number(openingCashBankJournalEntriesRow?.paid || 0);

    // Total opening debits = invoice payments + cash/bank received from journal entries
    // Total opening credits = expense payments + cash/bank paid from journal entries
    const totalOpeningCashDebit = openingInvoicePaymentsDebit + openingJournalReceivedDebit;
    const totalOpeningCashCredit = openingExpensePaymentsCredit + openingJournalPaidCredit;

    // Calculate net opening balance for Cash/Bank (receipts - payments)
    const openingCashBankBalance = totalOpeningCashDebit - totalOpeningCashCredit;
    // Always set opening balance for Cash/Bank, even if 0, so it appears in the report
    openingBalances.set('Cash/Bank', {
      debit: totalOpeningCashDebit,
      credit: totalOpeningCashCredit,
      balance: openingCashBankBalance,
    });

    // 9. Opening balance for Journal Entries (excluding cash/bank entries which are already included in Cash/Bank opening balance)
    const openingJournalQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select([
        "CASE WHEN entry.category = 'equity' THEN 'Equity - ' || entry.type::text ELSE 'Other - ' || entry.category::text END AS accountName",
        "SUM(CASE WHEN entry.type = 'shareholder_account' THEN entry.amount ELSE 0 END) AS debit",
        "SUM(CASE WHEN entry.type IN ('share_capital', 'retained_earnings') THEN entry.amount ELSE 0 END) AS credit",
      ])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date < :startDate', { startDate })
      .andWhere("entry.status NOT IN ('cash_paid', 'cash_received', 'bank_paid', 'bank_received')")
      .groupBy('entry.category')
      .addGroupBy('entry.type');

    const openingJournalRows = await openingJournalQuery.getRawMany();
    openingJournalRows.forEach((row) => {
      const debit = Number(row.debit || 0);
      const credit = Number(row.credit || 0);
      if (debit > 0 || credit > 0) {
        const accountName = row.accountname || row.accountName;
        // Determine account type based on account name pattern
        const isEquityAccount = accountName.includes('Equity');
        // For credit accounts (Equity, Revenue, Liabilities): balance = credit - debit
        // For debit accounts (Assets, Expenses): balance = debit - credit
        const balance = isEquityAccount ? credit - debit : debit - credit;
        openingBalances.set(accountName, {
          debit,
          credit,
          balance: balance,
        });
      }
    });

    // Calculate total opening balances
    let totalOpeningDebit = 0;
    let totalOpeningCredit = 0;
    openingBalances.forEach((balance) => {
      totalOpeningDebit += balance.debit;
      totalOpeningCredit += balance.credit;
    });

    // Calculate period totals
    const totalDebit = accounts.reduce((sum, acc) => sum + acc.debit, 0);
    const totalCredit = accounts.reduce((sum, acc) => sum + acc.credit, 0);
    
    // Calculate closing balances (opening + period)
    const totalClosingDebit = totalOpeningDebit + totalDebit;
    const totalClosingCredit = totalOpeningCredit + totalCredit;
    const totalOpeningBalance = totalOpeningDebit - totalOpeningCredit;
    const totalClosingBalance = totalClosingDebit - totalClosingCredit;
    
    // Validate trial balance - it should always balance (debits = credits)
    // In double-entry bookkeeping, every transaction has equal debits and credits
    const periodDifference = Math.abs(totalDebit - totalCredit);
    const closingDifference = Math.abs(totalClosingDebit - totalClosingCredit);
    const isBalanced = periodDifference < 0.01 && closingDifference < 0.01; // Allow for rounding errors

    // Add accounts that have opening balances but no period transactions
    // This ensures Cash/Bank and Accounts Payable always appear if they have any balance
    const accountNamesSet = new Set(accounts.map(acc => acc.accountName));
    openingBalances.forEach((opening, accountName) => {
      if (!accountNamesSet.has(accountName) && (opening.debit > 0 || opening.credit > 0 || opening.balance !== 0)) {
        // Determine account type based on account name
        let accountType = 'Asset';
        if (accountName === 'Accounts Payable' || accountName.includes('VAT Payable')) {
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

    // Add opening and closing balance to each account
    const accountsWithBalances = accounts.map((acc) => {
      const opening = openingBalances.get(acc.accountName) || { debit: 0, credit: 0, balance: 0 };
      const closingDebit = opening.debit + acc.debit;
      const closingCredit = opening.credit + acc.credit;
      
      // Calculate closing balance based on account type
      // For debit accounts (Assets, Expenses): balance = debit - credit
      // For credit accounts (Liabilities, Revenue, Equity): balance = credit - debit
      const isCreditAccount = acc.accountType === 'Liability' || acc.accountType === 'Revenue' || acc.accountType === 'Equity';
      const closingBalance = isCreditAccount ? closingCredit - closingDebit : closingDebit - closingCredit;
      
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

    return {
      period: {
        startDate,
        endDate,
      },
      accounts: accountsWithBalances.sort((a, b) => {
        // Sort by account type, then by name
        const typeOrder = ['Asset', 'Liability', 'Expense', 'Revenue', 'Journal Entry', 'Equity'];
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
        periodBalance: Number((totalDebit - totalCredit).toFixed(2)),
        closingDebit: Number(totalClosingDebit.toFixed(2)),
        closingCredit: Number(totalClosingCredit.toFixed(2)),
        closingBalance: Number(totalClosingBalance.toFixed(2)),
        // Legacy fields for backward compatibility
        totalDebit: Number(totalDebit.toFixed(2)),
        totalCredit: Number(totalCredit.toFixed(2)),
        totalBalance: Number((totalDebit - totalCredit).toFixed(2)),
        accountCount: accounts.length,
        // Trial balance validation
        isBalanced: isBalanced,
        periodDifference: Number(periodDifference.toFixed(2)),
        closingDifference: Number(closingDifference.toFixed(2)),
        warning: !isBalanced 
          ? `Trial balance is not balanced! Period difference: ${periodDifference.toFixed(2)}, Closing difference: ${closingDifference.toFixed(2)}. This indicates an accounting error that needs investigation.`
          : null,
      },
    };
  }

  /**
   * Balance Sheet Report
   * Shows Assets, Liabilities, and Equity
   * Includes: Accounts Receivable, Cash/Bank, VAT Receivable, Accounts Payable (Accruals), VAT Payable, and Equity (Revenue - Expenses + Journal Entries)
   * Note: Expenses reduce equity (retained earnings), they are NOT assets
   */
  private async buildBalanceSheet(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    const asOfDate =
      filters?.['endDate'] || new Date().toISOString().split('T')[0];
    const startDate =
      filters?.['startDate'] ||
      new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];

    const assets: Array<{ category: string; amount: number }> = [];
    let totalAssets = 0;

    // Note: Expenses are NOT assets - they reduce equity (retained earnings)
    // Expenses are calculated separately and deducted from equity in the equity section

    // 1. Assets: Accounts Receivable (unpaid invoices as of asOfDate)
    // Credit Notes reduce receivables, Debit Notes increase receivables
    const receivablesQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        "'Accounts Receivable' AS category",
        'SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0)) AS amount',
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date <= :asOfDate', { asOfDate })
      .andWhere('invoice.payment_status IN (:...statuses)', {
        statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
      });

    // Get Credit Notes that reduce receivables (as of asOfDate)
    const receivablesCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select([
        'SUM(COALESCE(creditNote.total_amount, 0)) AS credit',
      ])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date <= :asOfDate', { asOfDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      });

    // Get Debit Notes that increase receivables (as of asOfDate)
    const receivablesDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'SUM(COALESCE(debitNote.total_amount, 0)) AS debit',
      ])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date <= :asOfDate', { asOfDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    const [receivablesRow, receivablesCreditNotesRow, receivablesDebitNotesRow] = await Promise.all([
      receivablesQuery.getRawOne(),
      receivablesCreditNotesQuery.getRawOne(),
      receivablesDebitNotesQuery.getRawOne(),
    ]);

    const receivablesAmount = Number(receivablesRow?.amount || 0);
    const receivablesCreditNotes = Number(receivablesCreditNotesRow?.credit || 0);
    const receivablesDebitNotes = Number(receivablesDebitNotesRow?.debit || 0);
    // Net Accounts Receivable = Invoices - Credit Notes + Debit Notes
    const netReceivablesAmount = receivablesAmount - receivablesCreditNotes + receivablesDebitNotes;
    if (netReceivablesAmount > 0) {
      assets.push({
        category: 'Accounts Receivable',
        amount: netReceivablesAmount,
      });
      totalAssets += netReceivablesAmount;
    }

    // 2. Assets: Cash/Bank balances (net of payments)
    // Cash = Invoice Payments - Expense Payments + Journal Entries (cash/bank received - paid)
    const invoicePaymentsQuery = this.invoicePaymentsRepository
      .createQueryBuilder('payment')
      .select([
        'SUM(COALESCE(payment.amount, 0)) AS receipts',
      ])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date >= :startDate', { startDate })
      .andWhere('payment.payment_date <= :asOfDate', { asOfDate });

    const expensePaymentsQuery = this.expensePaymentsRepository
      .createQueryBuilder('payment')
      .select([
        'SUM(COALESCE(payment.amount, 0)) AS payments',
      ])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date >= :startDate', { startDate })
      .andWhere('payment.payment_date <= :asOfDate', { asOfDate });

    // Include journal entries with CASH_PAID, CASH_RECEIVED, BANK_PAID, and BANK_RECEIVED statuses
    const cashBankJournalEntriesQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select([
        "SUM(CASE WHEN entry.status IN ('cash_received', 'bank_received') THEN entry.amount ELSE 0 END) AS received",
        "SUM(CASE WHEN entry.status IN ('cash_paid', 'bank_paid') THEN entry.amount ELSE 0 END) AS paid",
      ])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date >= :startDate', { startDate })
      .andWhere('entry.entry_date <= :asOfDate', { asOfDate })
      .andWhere("entry.status IN ('cash_paid', 'cash_received', 'bank_paid', 'bank_received')");

    const [invoicePaymentsRow, expensePaymentsRow, cashBankJournalEntriesRow] = await Promise.all([
      invoicePaymentsQuery.getRawOne(),
      expensePaymentsQuery.getRawOne(),
      cashBankJournalEntriesQuery.getRawOne(),
    ]);

    const receipts = Number(invoicePaymentsRow?.receipts || 0);
    const payments = Number(expensePaymentsRow?.payments || 0);
    const journalReceived = Number(cashBankJournalEntriesRow?.received || 0);
    const journalPaid = Number(cashBankJournalEntriesRow?.paid || 0);
    const netCash = receipts - payments + journalReceived - journalPaid;
    if (netCash !== 0) {
      assets.push({
        category: 'Cash/Bank',
        amount: netCash,
      });
      totalAssets += netCash;
    }

    // 3. Assets: VAT Receivable (Input VAT from expenses)
    // Exclude type='credit' expenses as they are sales/revenue, not expenses
    const vatReceivableQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select([
        "'VAT Receivable (Input VAT)' AS category",
        'SUM(COALESCE(expense.vat_amount, 0)) AS amount',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date >= :startDate', { startDate })
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

    // Liabilities
    const liabilities: Array<{ vendor: string; amount: number; status: string; category?: string }> = [];
    let totalLiabilities = 0;

    // 1. Liabilities: Unpaid accruals (Accounts Payable)
    const accrualsQuery = this.accrualsRepository
      .createQueryBuilder('accrual')
      .select([
        'accrual.vendor_name AS vendor',
        'SUM(accrual.amount) AS amount',
        'accrual.status AS status',
      ])
      .where('accrual.organization_id = :organizationId', { organizationId })
      .andWhere('accrual.is_deleted = false')
      .andWhere('accrual.status = :status', {
        status: AccrualStatus.PENDING_SETTLEMENT,
      })
      .andWhere('accrual.created_at::date <= :asOfDate', { asOfDate })
      .groupBy('accrual.vendor_name')
      .addGroupBy('accrual.status');

    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      accrualsQuery.andWhere('accrual.status IN (:...statuses)', {
        statuses,
      });
    }

    const accrualsRows = await accrualsQuery.getRawMany();
    let totalAccountsPayable = 0;
    accrualsRows.forEach((row) => {
      const amount = Number(row.amount || 0);
      if (amount > 0) {
        liabilities.push({
          vendor: row.vendor || 'N/A',
          amount,
          status: row.status,
          category: 'Accounts Payable',
        });
        totalLiabilities += amount;
        totalAccountsPayable += amount;
      }
    });

    // Add summary entry for Accounts Payable if there are any accruals
    if (totalAccountsPayable > 0) {
      // The individual vendor entries are already added above, but we ensure they're clearly labeled
    }

    // 2. Liabilities: VAT Payable (Output VAT from sales invoices)
    // Include Credit Notes (reduce VAT Payable) and Debit Notes (increase VAT Payable)
    const vatPayableQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        "'VAT Payable (Output VAT)' AS category",
        'SUM(COALESCE(invoice.vat_amount, 0)) AS amount',
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date >= :startDate', { startDate })
      .andWhere('invoice.invoice_date <= :asOfDate', { asOfDate })
      .andWhere('invoice.vat_amount > 0');

    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      vatPayableQuery.andWhere('invoice.status IN (:...statuses)', { statuses });
    }

    // Get VAT from Credit Notes (reduce VAT Payable)
    const vatCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select([
        'SUM(COALESCE(creditNote.vat_amount, 0)) AS vat',
      ])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date >= :startDate', { startDate })
      .andWhere('creditNote.credit_note_date <= :asOfDate', { asOfDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      })
      .andWhere('creditNote.vat_amount > 0');

    // Get VAT from Debit Notes (increase VAT Payable)
    const vatDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'SUM(COALESCE(debitNote.vat_amount, 0)) AS vat',
      ])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
      .andWhere('debitNote.debit_note_date <= :asOfDate', { asOfDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      })
      .andWhere('debitNote.vat_amount > 0');

    const [vatPayableRow, vatCreditNotesRow, vatDebitNotesRow] = await Promise.all([
      vatPayableQuery.getRawOne(),
      vatCreditNotesQuery.getRawOne(),
      vatDebitNotesQuery.getRawOne(),
    ]);

    const vatPayableAmount = Number(vatPayableRow?.amount || 0);
    const vatCreditNotesAmount = Number(vatCreditNotesRow?.vat || 0);
    const vatDebitNotesAmount = Number(vatDebitNotesRow?.vat || 0);
    // Net VAT Payable = Output VAT - Credit Note VAT + Debit Note VAT
    const netVatPayableAmount = vatPayableAmount - vatCreditNotesAmount + vatDebitNotesAmount;
    if (netVatPayableAmount > 0) {
      liabilities.push({
        vendor: 'VAT Payable (Output VAT)',
        amount: netVatPayableAmount,
        status: 'Liability',
      });
      totalLiabilities += netVatPayableAmount;
    }

    // Equity: Revenue - Expenses + Journal Entries
    const revenueQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        'SUM(COALESCE(invoice.base_amount, invoice.amount)) AS revenue',
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date >= :startDate', { startDate })
      .andWhere('invoice.invoice_date <= :asOfDate', { asOfDate });

    // Subtract Credit Notes from revenue
    const creditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select([
        'SUM(COALESCE(creditNote.base_amount, creditNote.amount)) AS creditNotes',
      ])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date >= :startDate', { startDate })
      .andWhere('creditNote.credit_note_date <= :asOfDate', { asOfDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      });

    // Add Debit Notes to revenue
    const debitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'SUM(COALESCE(debitNote.base_amount, debitNote.amount)) AS debitNotes',
      ])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
      .andWhere('debitNote.debit_note_date <= :asOfDate', { asOfDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    // Get Journal Entries (equity items) - grouped by type for ledger details
    const journalEntriesQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select([
        "entry.type AS type",
        "SUM(entry.amount) AS amount",
      ])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date >= :startDate', { startDate })
      .andWhere('entry.entry_date <= :asOfDate', { asOfDate })
      .andWhere("entry.type IN ('share_capital', 'retained_earnings', 'shareholder_account')")
      .groupBy('entry.type');

    const [revenueRow, creditNotesRow, debitNotesRow, journalRows] = await Promise.all([
      revenueQuery.getRawOne(),
      creditNotesQuery.getRawOne(),
      debitNotesQuery.getRawOne(),
      journalEntriesQuery.getRawMany(),
    ]);

    const totalRevenue = Number(revenueRow?.revenue || 0);
    const creditNotesAmount = Number(creditNotesRow?.creditNotes || 0);
    const debitNotesAmount = Number(debitNotesRow?.debitNotes || 0);
    
    // Process journal entries by type
    const journalEquityMap = new Map<string, number>();
    let journalEquity = 0;
    let journalShareholder = 0;
    
    journalRows.forEach((row) => {
      const amount = Number(row.amount || 0);
      const type = row.type;
      journalEquityMap.set(type, amount);
      
      if (type === 'share_capital' || type === 'retained_earnings') {
        journalEquity += amount;
      } else if (type === 'shareholder_account') {
        journalShareholder += amount;
      }
    });

    // Net revenue = Revenue - Credit Notes + Debit Notes
    const netRevenue = totalRevenue - creditNotesAmount + debitNotesAmount;
    
    // Calculate total expenses (expenses reduce equity, they are NOT assets)
    // Exclude type='credit' expenses as they are sales/revenue, not expenses
    const expensesQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select([
        'SUM(COALESCE(expense.base_amount, expense.amount)) AS amount',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date >= :startDate', { startDate })
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
    
    // Equity = Net Revenue - Expenses + Journal Entries (equity increases, shareholder decreases)
    // Expenses reduce retained earnings (equity), they are NOT assets
    const totalEquity = netRevenue - totalExpenses + journalEquity - journalShareholder;

    // Calculate opening balances (before startDate)
    // Opening Assets
    // Exclude type='credit' expenses as they are sales/revenue, not expenses
    const openingExpensesQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select(['SUM(COALESCE(expense.base_amount, expense.amount)) AS amount'])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date < :startDate', { startDate })
      .andWhere("(expense.type IS NULL OR expense.type != 'credit')");

    const openingReceivablesQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select(['SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0)) AS amount'])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date < :startDate', { startDate })
      .andWhere('invoice.payment_status IN (:...statuses)', {
        statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
      });

    // Opening Credit Notes (reduce receivables)
    const openingReceivablesCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select(['SUM(COALESCE(creditNote.total_amount, 0)) AS credit'])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date < :startDate', { startDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      });

    // Opening Debit Notes (increase receivables)
    const openingReceivablesDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select(['SUM(COALESCE(debitNote.total_amount, 0)) AS debit'])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date < :startDate', { startDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    const openingCashQuery = this.invoicePaymentsRepository
      .createQueryBuilder('payment')
      .select(['SUM(COALESCE(payment.amount, 0)) AS receipts'])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date < :startDate', { startDate });

    const openingExpensePaymentsQuery = this.expensePaymentsRepository
      .createQueryBuilder('payment')
      .select(['SUM(COALESCE(payment.amount, 0)) AS payments'])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date < :startDate', { startDate });

    // Opening journal entries for cash/bank
    const openingCashBankJournalEntriesQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select([
        "SUM(CASE WHEN entry.status IN ('cash_received', 'bank_received') THEN entry.amount ELSE 0 END) AS received",
        "SUM(CASE WHEN entry.status IN ('cash_paid', 'bank_paid') THEN entry.amount ELSE 0 END) AS paid",
      ])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date < :startDate', { startDate })
      .andWhere("entry.status IN ('cash_paid', 'cash_received', 'bank_paid', 'bank_received')");

    // Exclude type='credit' expenses as they are sales/revenue, not expenses
    const openingVatReceivableQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select(['SUM(COALESCE(expense.vat_amount, 0)) AS amount'])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date < :startDate', { startDate })
      .andWhere('expense.vat_amount > 0')
      .andWhere("(expense.type IS NULL OR expense.type != 'credit')");

    // Opening Liabilities
    const openingAccrualsQuery = this.accrualsRepository
      .createQueryBuilder('accrual')
      .select(['SUM(accrual.amount) AS amount'])
      .where('accrual.organization_id = :organizationId', { organizationId })
      .andWhere('accrual.is_deleted = false')
      .andWhere('accrual.status = :status', { status: AccrualStatus.PENDING_SETTLEMENT })
      .andWhere('accrual.created_at::date < :startDate', { startDate });

    const openingVatPayableQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select(['SUM(COALESCE(invoice.vat_amount, 0)) AS amount'])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date < :startDate', { startDate })
      .andWhere('invoice.vat_amount > 0');

    // Opening Equity
    const openingRevenueQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select(['SUM(COALESCE(invoice.base_amount, invoice.amount)) AS revenue'])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date < :startDate', { startDate });

    // Opening Credit Notes
    const openingCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select(['SUM(COALESCE(creditNote.base_amount, creditNote.amount)) AS credit'])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date < :startDate', { startDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      });

    // Opening Debit Notes
    const openingDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select(['SUM(COALESCE(debitNote.base_amount, debitNote.amount)) AS debit'])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date < :startDate', { startDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    // Opening Journal Entries - grouped by type for ledger details
    const openingJournalQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select([
        "entry.type AS type",
        "SUM(entry.amount) AS amount",
      ])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date < :startDate', { startDate })
      .andWhere("entry.type IN ('share_capital', 'retained_earnings', 'shareholder_account')")
      .groupBy('entry.type');

    const [
      openingExpensesRow,
      openingReceivablesRow,
      openingReceivablesCreditNotesRow,
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
      openingCashBankJournalEntriesRow,
    ] = await Promise.all([
      openingExpensesQuery.getRawOne(),
      openingReceivablesQuery.getRawOne(),
      openingReceivablesCreditNotesQuery.getRawOne(),
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
      openingCashBankJournalEntriesQuery.getRawOne(),
    ]);

    const openingExpenses = Number(openingExpensesRow?.amount || 0);
    const openingReceivablesAmount = Number(openingReceivablesRow?.amount || 0);
    const openingReceivablesCreditNotes = Number(openingReceivablesCreditNotesRow?.credit || 0);
    const openingReceivablesDebitNotes = Number(openingReceivablesDebitNotesRow?.debit || 0);
    // Net opening Accounts Receivable = Invoices - Credit Notes + Debit Notes
    const openingReceivables = openingReceivablesAmount - openingReceivablesCreditNotes + openingReceivablesDebitNotes;
    const openingCashReceipts = Number(openingCashRow?.receipts || 0);
    const openingCashPayments = Number(openingExpensePaymentsRow?.payments || 0);
    const openingJournalReceived = Number(openingCashBankJournalEntriesRow?.received || 0);
    const openingJournalPaid = Number(openingCashBankJournalEntriesRow?.paid || 0);
    const openingCash = openingCashReceipts - openingCashPayments + openingJournalReceived - openingJournalPaid;
    const openingVatReceivable = Number(openingVatReceivableRow?.amount || 0);
    // Opening Assets: Only actual assets (receivables, cash, VAT receivable) - NOT expenses
    // Expenses reduce equity, they are NOT assets
    const openingAssets = openingReceivables + openingCash + openingVatReceivable;

    const openingAccruals = Number(openingAccrualsRow?.amount || 0);
    const openingVatPayable = Number(openingVatPayableRow?.amount || 0);

    // Opening Revenue: Include Credit Notes and Debit Notes
    const openingRevenue = Number(openingRevenueRow?.revenue || 0);
    const openingCreditNotes = Number(openingCreditNotesRow?.credit || 0);
    const openingDebitNotes = Number(openingDebitNotesRow?.debit || 0);
    const openingNetRevenue = openingRevenue - openingCreditNotes + openingDebitNotes;
    
    // Process opening journal entries by type
    const openingJournalEquityMap = new Map<string, number>();
    let openingJournalEquity = 0;
    let openingJournalShareholder = 0;
    
    openingJournalRows.forEach((row) => {
      const amount = Number(row.amount || 0);
      const type = row.type;
      openingJournalEquityMap.set(type, amount);
      
      if (type === 'share_capital' || type === 'retained_earnings') {
        openingJournalEquity += amount;
      } else if (type === 'shareholder_account') {
        openingJournalShareholder += amount;
      }
    });

    // Opening VAT Payable: Include Credit Notes and Debit Notes VAT
    const openingVatCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select(['SUM(COALESCE(creditNote.vat_amount, 0)) AS vat'])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date < :startDate', { startDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      })
      .andWhere('creditNote.vat_amount > 0');
    const openingVatDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select(['SUM(COALESCE(debitNote.vat_amount, 0)) AS vat'])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date < :startDate', { startDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      })
      .andWhere('debitNote.vat_amount > 0');
    const [openingVatCreditNotesRow, openingVatDebitNotesRow] = await Promise.all([
      openingVatCreditNotesQuery.getRawOne(),
      openingVatDebitNotesQuery.getRawOne(),
    ]);
    const openingVatCreditNotes = Number(openingVatCreditNotesRow?.vat || 0);
    const openingVatDebitNotes = Number(openingVatDebitNotesRow?.vat || 0);
    const openingNetVatPayable = openingVatPayable - openingVatCreditNotes + openingVatDebitNotes;
    const openingLiabilities = openingAccruals + openingNetVatPayable;

    // Calculate opening equity using processed journal entries
    const openingEquity = openingNetRevenue - openingExpenses + openingJournalEquity - openingJournalShareholder;

    // Closing balances (opening + period)
    const closingAssets = openingAssets + totalAssets;
    const closingLiabilities = openingLiabilities + totalLiabilities;
    const closingEquity = openingEquity + totalEquity;

    // Build equity ledger items with opening, period, and closing balances
    const equityItems: Array<{
      account: string;
      opening: number;
      period: number;
      closing: number;
    }> = [];

    // 1. Share Capital
    const openingShareCapital = Number(openingJournalEquityMap.get('share_capital') || 0);
    const periodShareCapital = Number(journalEquityMap.get('share_capital') || 0);
    const closingShareCapital = openingShareCapital + periodShareCapital;
    equityItems.push({
      account: 'Share Capital',
      opening: Number(openingShareCapital.toFixed(2)),
      period: Number(periodShareCapital.toFixed(2)),
      closing: Number(closingShareCapital.toFixed(2)),
    });

    // 2. Retained Earnings (includes revenue - expenses + retained_earnings journal entries)
    const openingRetainedEarningsJournal = Number(openingJournalEquityMap.get('retained_earnings') || 0);
    const periodRetainedEarningsJournal = Number(journalEquityMap.get('retained_earnings') || 0);
    const openingRetainedEarnings = openingNetRevenue - openingExpenses + openingRetainedEarningsJournal;
    const periodRetainedEarnings = netRevenue - totalExpenses + periodRetainedEarningsJournal;
    const closingRetainedEarnings = openingRetainedEarnings + periodRetainedEarnings;
    equityItems.push({
      account: 'Retained Earnings',
      opening: Number(openingRetainedEarnings.toFixed(2)),
      period: Number(periodRetainedEarnings.toFixed(2)),
      closing: Number(closingRetainedEarnings.toFixed(2)),
    });

    // 3. Shareholder Account (reduces equity)
    const openingShareholderAccount = Number(openingJournalEquityMap.get('shareholder_account') || 0);
    const periodShareholderAccount = Number(journalEquityMap.get('shareholder_account') || 0);
    const closingShareholderAccount = openingShareholderAccount + periodShareholderAccount;
    equityItems.push({
      account: 'Shareholder Account',
      opening: Number(openingShareholderAccount.toFixed(2)),
      period: Number(periodShareholderAccount.toFixed(2)),
      closing: Number(closingShareholderAccount.toFixed(2)),
    });

    return {
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
        journalEquity: Number(journalEquity.toFixed(2)),
        journalShareholder: Number(journalShareholder.toFixed(2)),
        opening: Number(openingEquity.toFixed(2)),
        period: Number(totalEquity.toFixed(2)),
        closing: Number(closingEquity.toFixed(2)),
        net: Number(totalEquity.toFixed(2)),
      },
      summary: {
        openingAssets: Number(openingAssets.toFixed(2)),
        openingLiabilities: Number(openingLiabilities.toFixed(2)),
        openingEquity: Number(openingEquity.toFixed(2)),
        openingBalance: Number((openingAssets - openingLiabilities - openingEquity).toFixed(2)),
        periodAssets: Number(totalAssets.toFixed(2)),
        periodLiabilities: Number(totalLiabilities.toFixed(2)),
        periodEquity: Number(totalEquity.toFixed(2)),
        totalAssets: Number(totalAssets.toFixed(2)),
        totalLiabilities: Number(totalLiabilities.toFixed(2)),
        totalEquity: Number(totalEquity.toFixed(2)),
        closingAssets: Number(closingAssets.toFixed(2)),
        closingLiabilities: Number(closingLiabilities.toFixed(2)),
        closingEquity: Number(closingEquity.toFixed(2)),
        closingBalance: Number((closingAssets - closingLiabilities - closingEquity).toFixed(2)),
        balance: Number(
          (totalAssets - totalLiabilities - totalEquity).toFixed(2),
        ),
      },
    };
  }

  /**
   * Profit and Loss Statement
   * Shows Revenue and Expenses for a period
   * Includes: Sales Invoices, Credit Notes, Debit Notes, Expenses
   */
  private async buildProfitAndLoss(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    const startDate =
      filters?.['startDate'] ||
      new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const endDate =
      filters?.['endDate'] || new Date().toISOString().split('T')[0];

    // Revenue: Sales invoices
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

    // Credit Notes: Reduce revenue
    const creditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select([
        'SUM(COALESCE(creditNote.base_amount, creditNote.amount)) AS amount',
        'SUM(creditNote.vat_amount) AS vat',
        'COUNT(creditNote.id) AS count',
      ])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date >= :startDate', { startDate })
      .andWhere('creditNote.credit_note_date <= :endDate', { endDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      });

    // Debit Notes: Increase revenue
    const debitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'SUM(COALESCE(debitNote.base_amount, debitNote.amount)) AS amount',
        'SUM(debitNote.vat_amount) AS vat',
        'COUNT(debitNote.id) AS count',
      ])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
      .andWhere('debitNote.debit_note_date <= :endDate', { endDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    const [revenueResult, creditNotesResult, debitNotesResult] = await Promise.all([
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

    // Net Revenue = Revenue - Credit Notes + Debit Notes
    const netRevenue = totalRevenue - creditNotesAmount + debitNotesAmount;
    const netRevenueVat = revenueVat - creditNotesVat + debitNotesVat;

    // Expenses: Grouped by category
    // Exclude type='credit' expenses as they are sales/revenue, not expenses
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
      .orderBy('amount', 'DESC');

    if (filters?.['type']) {
      const types = Array.isArray(filters.type)
        ? filters.type
        : [filters.type];
      expenseQuery.andWhere('expense.type IN (:...types)', { types });
    }

    const expenseRows = await expenseQuery.getRawMany();
    const totalExpenses = expenseRows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );
    const expenseVat = expenseRows.reduce(
      (sum, row) => sum + Number(row.vat || 0),
      0,
    );

    const netProfit = netRevenue - totalExpenses;

    // Calculate opening retained earnings (revenue - expenses before startDate)
    const openingRevenueQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select(['SUM(COALESCE(invoice.base_amount, invoice.amount)) AS revenue'])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date < :startDate', { startDate });

    // Exclude type='credit' expenses as they are sales/revenue, not expenses
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

    // Closing retained earnings = opening + net profit
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

  /**
   * Payables Report (Accruals)
   * Shows outstanding amounts owed to vendors
   */
  private async buildPayables(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    const asOfDate =
      filters?.['endDate'] || new Date().toISOString().split('T')[0];
    const startDate = filters?.['startDate'] || null;

    const query = this.accrualsRepository
      .createQueryBuilder('accrual')
      .leftJoin('accrual.expense', 'expense')
      .leftJoin('expense.category', 'category')
      .select([
        'accrual.id AS accrualId',
        'accrual.vendor_name AS vendor',
        'accrual.amount AS amount',
        'accrual.expected_payment_date AS expectedDate',
        'accrual.settlement_date AS settlementDate',
        'accrual.status AS status',
        "COALESCE(category.name, 'Uncategorized') AS category",
        'expense.description AS description',
      ])
      .where('accrual.organization_id = :organizationId', { organizationId })
      .andWhere('accrual.is_deleted = false');

    // Filter by status
    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      query.andWhere('accrual.status IN (:...statuses)', { statuses });
    } else {
      // Default: show only pending
      query.andWhere('accrual.status = :status', {
        status: AccrualStatus.PENDING_SETTLEMENT,
      });
    }

    // Filter by date range
    if (filters?.['startDate']) {
      query.andWhere('accrual.expected_payment_date >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters?.['endDate']) {
      query.andWhere('accrual.expected_payment_date <= :endDate', {
        endDate: filters.endDate,
      });
    }

    // Filter by vendor
    if (filters?.['vendorName']) {
      const vendors = Array.isArray(filters.vendorName)
        ? filters.vendorName
        : [filters.vendorName];
      query.andWhere('accrual.vendor_name IN (:...vendors)', { vendors });
    }

    query.orderBy('accrual.expected_payment_date', 'ASC');

    const rows = await query.getRawMany();

    // Note: Raw SQL queries return lowercase column names in PostgreSQL
    // Calculate overdue items
    const overdueItems = rows.filter(
      (row) =>
        row.status === AccrualStatus.PENDING_SETTLEMENT &&
        (row.expecteddate || row.expectedDate) &&
        new Date(row.expecteddate || row.expectedDate) < new Date(asOfDate),
    );

    const totalAmount = rows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );
    const overdueAmount = overdueItems.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );

    // Calculate opening balance (accruals before startDate that are still pending)
    let openingBalance = 0;
    let periodAmount = totalAmount;
    
    if (startDate) {
      const openingQuery = this.accrualsRepository
        .createQueryBuilder('accrual')
        .select(['SUM(accrual.amount) AS amount'])
        .where('accrual.organization_id = :organizationId', { organizationId })
        .andWhere('accrual.is_deleted = false')
        .andWhere('accrual.status = :status', { status: AccrualStatus.PENDING_SETTLEMENT })
        .andWhere('accrual.created_at::date < :startDate', { startDate });

      if (filters?.['status']) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        openingQuery.andWhere('accrual.status IN (:...statuses)', { statuses });
      }

      const openingRow = await openingQuery.getRawOne();
      openingBalance = Number(openingRow?.amount || 0);

      // Period amount = accruals created in the period
      const periodQuery = this.accrualsRepository
        .createQueryBuilder('accrual')
        .select(['SUM(accrual.amount) AS amount'])
        .where('accrual.organization_id = :organizationId', { organizationId })
        .andWhere('accrual.is_deleted = false')
        .andWhere('accrual.created_at::date >= :startDate', { startDate })
        .andWhere('accrual.created_at::date <= :asOfDate', { asOfDate });

      if (filters?.['status']) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        periodQuery.andWhere('accrual.status IN (:...statuses)', { statuses });
      } else {
        periodQuery.andWhere('accrual.status = :status', {
          status: AccrualStatus.PENDING_SETTLEMENT,
        });
      }

      const periodRow = await periodQuery.getRawOne();
      periodAmount = Number(periodRow?.amount || 0);
    }

    const closingBalance = openingBalance + periodAmount;

    return {
      asOfDate,
      period: startDate ? { startDate, endDate: asOfDate } : undefined,
      items: rows.map((row) => ({
        accrualId: row.accrualid || row.accrualId,
        vendor: row.vendor || 'N/A',
        amount: Number(row.amount || 0),
        expectedDate: row.expecteddate || row.expectedDate,
        settlementDate: row.settlementdate || row.settlementDate,
        status: row.status,
        category: row.category,
        description: row.description || 'N/A',
        isOverdue:
          row.status === AccrualStatus.PENDING_SETTLEMENT &&
          (row.expecteddate || row.expectedDate) &&
          new Date(row.expecteddate || row.expectedDate) < new Date(asOfDate),
      })),
      summary: {
        openingBalance: Number(openingBalance.toFixed(2)),
        periodAmount: Number(periodAmount.toFixed(2)),
        closingBalance: Number(closingBalance.toFixed(2)),
        totalItems: rows.length,
        totalAmount: Number(totalAmount.toFixed(2)),
        overdueItems: overdueItems.length,
        overdueAmount: Number(overdueAmount.toFixed(2)),
        paidItems: rows.filter(
          (r) => r.status === AccrualStatus.SETTLED,
        ).length,
        pendingItems: rows.filter(
          (r) => r.status === AccrualStatus.PENDING_SETTLEMENT,
        ).length,
      },
    };
  }

  /**
   * Receivables Report
   * Shows outstanding amounts owed by customers
   * Includes: Sales Invoices, Credit Notes (reduce receivables), Debit Notes (increase receivables)
   */
  private async buildReceivables(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    const asOfDate =
      filters?.['endDate'] || new Date().toISOString().split('T')[0];
    const startDate = filters?.['startDate'] || null;

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
      ])
      .where('invoice.organization_id = :organizationId', { organizationId });

    // Filter by payment status
    if (filters?.['paymentStatus']) {
      const statuses = Array.isArray(filters.paymentStatus)
        ? filters.paymentStatus
        : [filters.paymentStatus];
      query.andWhere('invoice.payment_status IN (:...statuses)', { statuses });
    } else {
      // Default: show invoices with outstanding amounts
      // Check if total_amount > paid_amount (has outstanding balance)
      // This catches invoices even if payment_status is incorrectly set to PAID
      query.andWhere(
        '(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0)) > 0',
      );
    }

    // Filter by invoice status
    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      query.andWhere('invoice.status IN (:...statuses)', { statuses });
    }

    // For receivables, show ALL unpaid invoices as of endDate, regardless of when they were created
    // This is different from other reports - receivables shows outstanding balances, not period transactions
    // Only filter by endDate if provided - if not provided, show all unpaid invoices
    if (filters?.['endDate']) {
      // Show invoices that were created on or before the endDate
      query.andWhere('invoice.invoice_date <= :endDate', {
        endDate: filters.endDate,
      });
    }
    // Do NOT filter by startDate for the items list - we want all unpaid invoices as of endDate
    // The startDate is only used for calculating opening balances in the summary

    // Filter by customer
    if (filters?.['customerName']) {
      const customers = Array.isArray(filters.customerName)
        ? filters.customerName
        : [filters.customerName];
      query.andWhere(
        '(customer.name IN (:...customers) OR invoice.customer_name IN (:...customers))',
        { customers },
      );
    }

    query.orderBy('invoice.due_date', 'ASC');

    const rows = await query.getRawMany();

    // Get Credit Notes and Debit Notes that affect receivables
    // Credit Notes reduce receivables, Debit Notes increase receivables
    const creditNotesQuery = this.creditNotesRepository
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
      ])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      });

    // Apply same filters as invoices
    if (filters?.['startDate']) {
      creditNotesQuery.andWhere('creditNote.credit_note_date >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters?.['endDate']) {
      creditNotesQuery.andWhere('creditNote.credit_note_date <= :endDate', {
        endDate: filters.endDate,
      });
    }
    if (filters?.['customerName']) {
      const customers = Array.isArray(filters.customerName)
        ? filters.customerName
        : [filters.customerName];
      creditNotesQuery.andWhere(
        '(customer.name IN (:...customers) OR creditNote.customer_name IN (:...customers))',
        { customers },
      );
    }

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
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    // Apply same filters as invoices
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

    const [creditNotesRows, debitNotesRows] = await Promise.all([
      creditNotesQuery.getRawMany(),
      debitNotesQuery.getRawMany(),
    ]);

    // Note: Raw SQL queries return lowercase column names in PostgreSQL
    // Calculate outstanding amounts and overdue items
    const invoiceItems = rows.map((row) => {
      const total = Number(row.total || 0);
      const paid = Number(row.paidamount || row.paidAmount || 0);
      const outstanding = total - paid;
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

    // Add Credit Notes (reduce receivables - negative outstanding)
    const creditNoteItems = creditNotesRows.map((row) => {
      const total = Number(row.total || 0);
      return {
        type: 'credit_note',
        creditNoteId: row.creditnoteid || row.creditNoteId,
        creditNoteNumber: row.creditnotenumber || row.creditNoteNumber,
        customer: row.customer,
        amount: Number(row.amount || 0),
        vat: Number(row.vat || 0),
        total: total,
        paid: 0,
        outstanding: -total, // Negative because it reduces receivables
        invoiceDate: row.creditnotedate || row.creditNoteDate,
        dueDate: null,
        paidDate: null,
        status: row.status,
        paymentStatus: null,
        relatedInvoice: row.relatedinvoice || row.relatedInvoice,
        isOverdue: false,
      };
    });

    // Add Debit Notes (increase receivables - positive outstanding)
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
        outstanding: total, // Positive because it increases receivables
        invoiceDate: row.debitnotedate || row.debitNoteDate,
        dueDate: null,
        paidDate: null,
        status: row.status,
        paymentStatus: null,
        relatedInvoice: row.relatedinvoice || row.relatedInvoice,
        isOverdue: false,
      };
    });

    // Filter invoice items to only show those with outstanding amounts > 0
    // (Some invoices might have payment_status = PAID but still have outstanding due to data inconsistencies)
    const filteredInvoiceItems = invoiceItems.filter(
      (item) => item.outstanding > 0,
    );

    // Combine all items
    const allItems = [...filteredInvoiceItems, ...creditNoteItems, ...debitNoteItems];

    const overdueItems = allItems.filter((item) => item.isOverdue);
    const totalOutstanding = allItems.reduce(
      (sum, item) => sum + item.outstanding,
      0,
    );
    const overdueAmount = overdueItems.reduce(
      (sum, item) => sum + item.outstanding,
      0,
    );

    // Calculate opening balance (receivables before startDate)
    let openingBalance = 0;
    let periodOutstanding = totalOutstanding;

    if (startDate) {
      // Opening receivables = invoices before startDate that are still unpaid
      const openingInvoicesQuery = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select([
          'SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0)) AS outstanding',
        ])
        .where('invoice.organization_id = :organizationId', { organizationId })
        .andWhere('invoice.invoice_date < :startDate', { startDate })
        .andWhere('invoice.payment_status IN (:...statuses)', {
          statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
        });

      if (filters?.['paymentStatus']) {
        const statuses = Array.isArray(filters.paymentStatus)
          ? filters.paymentStatus
          : [filters.paymentStatus];
        openingInvoicesQuery.andWhere('invoice.payment_status IN (:...statuses)', { statuses });
      }

      // Opening credit notes (reduce receivables)
      const openingCreditNotesQuery = this.creditNotesRepository
        .createQueryBuilder('creditNote')
        .select(['SUM(COALESCE(creditNote.total_amount, 0)) AS total'])
        .where('creditNote.organization_id = :organizationId', { organizationId })
        .andWhere('creditNote.status IN (:...statuses)', {
          statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
        })
        .andWhere('creditNote.credit_note_date < :startDate', { startDate });

      // Opening debit notes (increase receivables)
      const openingDebitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select(['SUM(COALESCE(debitNote.total_amount, 0)) AS total'])
        .where('debitNote.organization_id = :organizationId', { organizationId })
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        })
        .andWhere('debitNote.debit_note_date < :startDate', { startDate });

      const [openingInvoicesRow, openingCreditNotesRow, openingDebitNotesRow] = await Promise.all([
        openingInvoicesQuery.getRawOne(),
        openingCreditNotesQuery.getRawOne(),
        openingDebitNotesQuery.getRawOne(),
      ]);

      const openingInvoices = Number(openingInvoicesRow?.outstanding || 0);
      const openingCreditNotes = Number(openingCreditNotesRow?.total || 0);
      const openingDebitNotes = Number(openingDebitNotesRow?.total || 0);
      openingBalance = openingInvoices - openingCreditNotes + openingDebitNotes;

      // Period outstanding = receivables created in the period
      const periodInvoicesQuery = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select([
          'SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0)) AS outstanding',
        ])
        .where('invoice.organization_id = :organizationId', { organizationId })
        .andWhere('invoice.invoice_date >= :startDate', { startDate })
        .andWhere('invoice.invoice_date <= :asOfDate', { asOfDate })
        .andWhere('invoice.payment_status IN (:...statuses)', {
          statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
        });

      if (filters?.['paymentStatus']) {
        const statuses = Array.isArray(filters.paymentStatus)
          ? filters.paymentStatus
          : [filters.paymentStatus];
        periodInvoicesQuery.andWhere('invoice.payment_status IN (:...statuses)', { statuses });
      }

      const periodCreditNotesQuery = this.creditNotesRepository
        .createQueryBuilder('creditNote')
        .select(['SUM(COALESCE(creditNote.total_amount, 0)) AS total'])
        .where('creditNote.organization_id = :organizationId', { organizationId })
        .andWhere('creditNote.status IN (:...statuses)', {
          statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
        })
        .andWhere('creditNote.credit_note_date >= :startDate', { startDate })
        .andWhere('creditNote.credit_note_date <= :asOfDate', { asOfDate });

      const periodDebitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select(['SUM(COALESCE(debitNote.total_amount, 0)) AS total'])
        .where('debitNote.organization_id = :organizationId', { organizationId })
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        })
        .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
        .andWhere('debitNote.debit_note_date <= :asOfDate', { asOfDate });

      const [periodInvoicesRow, periodCreditNotesRow, periodDebitNotesRow] = await Promise.all([
        periodInvoicesQuery.getRawOne(),
        periodCreditNotesQuery.getRawOne(),
        periodDebitNotesQuery.getRawOne(),
      ]);

      const periodInvoices = Number(periodInvoicesRow?.outstanding || 0);
      const periodCreditNotes = Number(periodCreditNotesRow?.total || 0);
      const periodDebitNotes = Number(periodDebitNotesRow?.total || 0);
      periodOutstanding = periodInvoices - periodCreditNotes + periodDebitNotes;
    }

    const closingBalance = openingBalance + periodOutstanding;

    return {
      asOfDate,
      period: startDate ? { startDate, endDate: asOfDate } : undefined,
      items: allItems,
      summary: {
        openingBalance: Number(openingBalance.toFixed(2)),
        periodOutstanding: Number(periodOutstanding.toFixed(2)),
        periodAmount: Number(periodOutstanding.toFixed(2)), // Alias for consistency
        closingBalance: Number(closingBalance.toFixed(2)),
        totalInvoices: filteredInvoiceItems.length,
        totalCreditNotes: creditNoteItems.length,
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

  /**
   * VAT Control Account Report
   * Shows VAT input (from expenses/purchases) and VAT output (from sales invoices)
   * Calculates net VAT position
   */
  private async buildVatControlAccount(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    let startDate = filters?.['startDate'];
    let endDate = filters?.['endDate'];

    // If dates not provided, use current month
    if (!startDate || !endDate) {
      const today = new Date();
      startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
    }

    // Get VAT Input from Expenses (excluding reverse charge as it's not reclaimable)
    // Exclude type='credit' expenses as they are sales/revenue, not expenses
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
      .andWhere("(expense.vat_tax_type IS NULL OR expense.vat_tax_type != 'reverse_charge')")
      .andWhere("(expense.type IS NULL OR expense.type != 'credit')")
      .orderBy('expense.expense_date', 'DESC');

    const vatInputExpenses = await vatInputQuery.getRawMany();

    const vatInputItems = vatInputExpenses.map((expense: any) => {
      // Note: Raw SQL queries return lowercase column names in PostgreSQL
      const vatAmount = parseFloat(expense.vatamount || expense.vatAmount || '0');
      const amount = parseFloat(expense.amount || '0');
      const baseAmount = amount - vatAmount;
      const vatRate = baseAmount > 0 ? ((vatAmount / baseAmount) * 100).toFixed(2) : '0';
      const vendorName = expense.vendorname || expense.vendorName || 'N/A';
      const trn = expense.trn || null;

      return {
        id: expense.expenseid || expense.expenseId,
        date: expense.expensedate || expense.expenseDate,
        description: expense.description || vendorName || 'Expense',
        vendorName: vendorName,
        amount: Number(amount.toFixed(2)),
        vatRate: Number(vatRate),
        vatAmount: Number(vatAmount.toFixed(2)),
        trn: trn,
        type: 'expense',
      };
    });

    // Get VAT Output from Sales Invoices
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
      .orderBy('invoice.invoice_date', 'DESC');

    // Get VAT from Credit Notes (reduce output VAT)
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
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date >= :startDate', { startDate })
      .andWhere('creditNote.credit_note_date <= :endDate', { endDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      })
      .andWhere('CAST(creditNote.vat_amount AS DECIMAL) > 0')
      .orderBy('creditNote.credit_note_date', 'DESC');

    // Get VAT from Debit Notes (increase output VAT)
    const vatDebitNotesQuery = this.debitNotesRepository
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
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
      .andWhere('debitNote.debit_note_date <= :endDate', { endDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      })
      .andWhere('CAST(debitNote.vat_amount AS DECIMAL) > 0')
      .orderBy('debitNote.debit_note_date', 'DESC');

    const [vatOutputInvoices, vatCreditNotes, vatDebitNotes] = await Promise.all([
      vatOutputQuery.getRawMany(),
      vatCreditNotesQuery.getRawMany(),
      vatDebitNotesQuery.getRawMany(),
    ]);

    const vatOutputItems = vatOutputInvoices.map((invoice: any) => {
      // Note: Raw SQL queries return lowercase column names in PostgreSQL
      const vatAmount = parseFloat(invoice.vatamount || invoice.vatAmount || '0');
      const amount = parseFloat(invoice.amount || '0');
      const baseAmount = amount - vatAmount;
      const vatRate = baseAmount > 0 ? ((vatAmount / baseAmount) * 100).toFixed(2) : '0';
      const customerName = invoice.customername || invoice.customerName || 'N/A';
      const trn = invoice.trn || null;

      return {
        id: invoice.invoiceid || invoice.invoiceId,
        date: invoice.invoicedate || invoice.invoiceDate,
        description: invoice.invoicenumber || invoice.invoiceNumber || customerName || 'Invoice',
        invoiceNumber: invoice.invoicenumber || invoice.invoiceNumber,
        customerName: customerName,
        amount: Number(amount.toFixed(2)),
        vatRate: Number(vatRate),
        vatAmount: Number(vatAmount.toFixed(2)),
        trn: trn,
        type: 'invoice',
      };
    });

    const vatCreditNoteItems = vatCreditNotes.map((creditNote: any) => {
      const vatAmount = parseFloat(creditNote.vatamount || creditNote.vatAmount || '0');
      const amount = parseFloat(creditNote.amount || '0');
      const baseAmount = amount - vatAmount;
      const vatRate = baseAmount > 0 ? ((vatAmount / baseAmount) * 100).toFixed(2) : '0';
      const customerName = creditNote.customername || creditNote.customerName || 'N/A';
      const trn = creditNote.trn || null;

      return {
        id: creditNote.creditnoteid || creditNote.creditNoteId,
        date: creditNote.creditnotedate || creditNote.creditNoteDate,
        description: creditNote.creditnotenumber || creditNote.creditNoteNumber || customerName || 'Credit Note',
        creditNoteNumber: creditNote.creditnotenumber || creditNote.creditNoteNumber,
        customerName: customerName,
        amount: Number(amount.toFixed(2)),
        vatRate: Number(vatRate),
        vatAmount: Number(vatAmount.toFixed(2)),
        trn: trn,
        type: 'credit_note',
      };
    });

    const vatDebitNoteItems = vatDebitNotes.map((debitNote: any) => {
      const vatAmount = parseFloat(debitNote.vatamount || debitNote.vatAmount || '0');
      const amount = parseFloat(debitNote.amount || '0');
      const baseAmount = amount - vatAmount;
      const vatRate = baseAmount > 0 ? ((vatAmount / baseAmount) * 100).toFixed(2) : '0';
      const customerName = debitNote.customername || debitNote.customerName || 'N/A';
      const trn = debitNote.trn || null;

      return {
        id: debitNote.debitnoteid || debitNote.debitNoteId,
        date: debitNote.debitnotedate || debitNote.debitNoteDate,
        description: debitNote.debitnotenumber || debitNote.debitNoteNumber || customerName || 'Debit Note',
        debitNoteNumber: debitNote.debitnotenumber || debitNote.debitNoteNumber,
        customerName: customerName,
        amount: Number(amount.toFixed(2)),
        vatRate: Number(vatRate),
        vatAmount: Number(vatAmount.toFixed(2)),
        trn: trn,
        type: 'debit_note',
      };
    });

    // Calculate totals
    const totalVatInput = vatInputItems.reduce((sum, item) => sum + item.vatAmount, 0);
    const totalVatOutput = vatOutputItems.reduce((sum, item) => sum + item.vatAmount, 0);
    const totalVatCreditNotes = vatCreditNoteItems.reduce((sum, item) => sum + item.vatAmount, 0);
    const totalVatDebitNotes = vatDebitNoteItems.reduce((sum, item) => sum + item.vatAmount, 0);
    // Net VAT Output = Output VAT - Credit Note VAT + Debit Note VAT
    const netVatOutput = totalVatOutput - totalVatCreditNotes + totalVatDebitNotes;
    const netVat = netVatOutput - totalVatInput;

    return {
      startDate,
      endDate,
      vatInputItems,
      vatOutputItems: [...vatOutputItems, ...vatCreditNoteItems, ...vatDebitNoteItems],
      summary: {
        vatInput: Number(totalVatInput.toFixed(2)),
        vatOutput: Number(totalVatOutput.toFixed(2)),
        vatCreditNotes: Number(totalVatCreditNotes.toFixed(2)),
        vatDebitNotes: Number(totalVatDebitNotes.toFixed(2)),
        netVatOutput: Number(netVatOutput.toFixed(2)),
        netVat: Number(netVat.toFixed(2)),
        totalTransactions: vatInputItems.length + vatOutputItems.length + vatCreditNoteItems.length + vatDebitNoteItems.length,
        inputTransactions: vatInputItems.length,
        outputTransactions: vatOutputItems.length,
        creditNoteTransactions: vatCreditNoteItems.length,
        debitNoteTransactions: vatDebitNoteItems.length,
      },
    };
  }
}
