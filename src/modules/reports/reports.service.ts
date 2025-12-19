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
import { ExpenseType } from '../../common/enums/expense-type.enum';
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
    if (revenueCredit > 0) {
      accounts.push({
        accountName: revenueRow?.accountname || 'Sales Revenue',
        accountType: revenueRow?.accounttype || 'Revenue',
        debit: 0,
        credit: revenueCredit,
        balance: -revenueCredit,
      });
    }

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
    if (accrualsCredit > 0) {
      accounts.push({
        accountName: 'Accounts Payable',
        accountType: 'Liability',
        debit: 0,
        credit: accrualsCredit,
        balance: -accrualsCredit,
      });
    }

    // 4. Get Accounts Receivable (unpaid invoices as of end date) - Debits (assets)
    // Show all unpaid/partial invoices that exist as of the end date
    const receivablesQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        "'Accounts Receivable' AS accountName",
        "'Asset' AS accountType",
        'SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0)) AS debit',
        '0 AS credit',
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date <= :endDate', { endDate })
      .andWhere('invoice.payment_status IN (:...statuses)', {
        statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
      });

    const receivablesRow = await receivablesQuery.getRawOne();
    const receivablesDebit = Number(receivablesRow?.debit || 0);
    if (receivablesDebit > 0) {
      accounts.push({
        accountName: 'Accounts Receivable',
        accountType: 'Asset',
        debit: receivablesDebit,
        credit: 0,
        balance: receivablesDebit,
      });
    }

    // 5. Get VAT Receivable (Input VAT from expenses) - Debits (Asset)
    // Input VAT on purchases/expenses is an asset (you can claim it back)
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
      .andWhere('expense.vat_amount > 0');

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
    if (vatPayableCredit > 0) {
      accounts.push({
        accountName: 'VAT Payable (Output VAT)',
        accountType: 'Liability',
        debit: 0,
        credit: vatPayableCredit,
        balance: -vatPayableCredit,
      });
    }

    // 7. Get Cash/Bank - Expense Payments (credits - cash outflows)
    const expensePaymentsQuery = this.expensePaymentsRepository
      .createQueryBuilder('payment')
      .select([
        "'Cash/Bank - Payments' AS accountName",
        "'Asset' AS accountType",
        '0 AS debit',
        'SUM(COALESCE(payment.amount, 0)) AS credit',
      ])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date >= :startDate', { startDate })
      .andWhere('payment.payment_date <= :endDate', { endDate });

    const expensePaymentsRow = await expensePaymentsQuery.getRawOne();
    const expensePaymentsCredit = Number(expensePaymentsRow?.credit || 0);

    // 8. Get Cash/Bank - Invoice Payments (debits - cash inflows)
    const invoicePaymentsQuery = this.invoicePaymentsRepository
      .createQueryBuilder('payment')
      .select([
        "'Cash/Bank - Receipts' AS accountName",
        "'Asset' AS accountType",
        'SUM(COALESCE(payment.amount, 0)) AS debit',
        '0 AS credit',
      ])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date >= :startDate', { startDate })
      .andWhere('payment.payment_date <= :endDate', { endDate });

    const invoicePaymentsRow = await invoicePaymentsQuery.getRawOne();
    const invoicePaymentsDebit = Number(invoicePaymentsRow?.debit || 0);

    // Combine cash/bank accounts
    const netCash = invoicePaymentsDebit - expensePaymentsCredit;
    if (netCash !== 0 || expensePaymentsCredit > 0 || invoicePaymentsDebit > 0) {
      // Add separate entries for clarity, or combine if net is desired
      if (expensePaymentsCredit > 0) {
        accounts.push({
          accountName: 'Cash/Bank - Payments',
          accountType: 'Asset',
          debit: 0,
          credit: expensePaymentsCredit,
          balance: -expensePaymentsCredit,
        });
      }
      if (invoicePaymentsDebit > 0) {
        accounts.push({
          accountName: 'Cash/Bank - Receipts',
          accountType: 'Asset',
          debit: invoicePaymentsDebit,
          credit: 0,
          balance: invoicePaymentsDebit,
        });
      }
    }

    // 9. Get Journal Entries
    // Journal entries: equity types (share_capital, retained_earnings) are typically credits
    // shareholder_account entries are typically debits
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
      .groupBy('entry.category')
      .addGroupBy('entry.type');

    const journalRows = await journalEntriesQuery.getRawMany();
    journalRows.forEach((row) => {
      const debit = Number(row.debit || 0);
      const credit = Number(row.credit || 0);
      if (debit > 0 || credit > 0) {
        accounts.push({
          accountName: row.accountname || 'Journal Entry',
          accountType: row.accounttype || 'Journal Entry',
          debit,
          credit,
          balance: debit - credit,
        });
      }
    });

    // Calculate opening balances (before startDate) for each account
    const openingBalances = new Map<string, { debit: number; credit: number; balance: number }>();

    // 1. Opening balances for expenses by category
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

    // 2. Opening balance for Sales Revenue
    const openingRevenueQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        "'Sales Revenue' AS accountName",
        '0 AS debit',
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
    if (openingRevenueCredit > 0) {
      openingBalances.set('Sales Revenue', {
        debit: 0,
        credit: openingRevenueCredit,
        balance: -openingRevenueCredit,
      });
    }

    // 3. Opening balance for Accounts Payable (accruals before startDate that are still pending)
    const openingAccrualsQuery = this.accrualsRepository
      .createQueryBuilder('accrual')
      .select([
        "'Accounts Payable' AS accountName",
        '0 AS debit',
        'SUM(accrual.amount) AS credit',
      ])
      .where('accrual.organization_id = :organizationId', { organizationId })
      .andWhere('accrual.is_deleted = false')
      .andWhere('accrual.status = :status', { status: AccrualStatus.PENDING_SETTLEMENT })
      .andWhere('accrual.created_at::date < :startDate', { startDate });

    const openingAccrualsRow = await openingAccrualsQuery.getRawOne();
    const openingAccrualsCredit = Number(openingAccrualsRow?.credit || 0);
    if (openingAccrualsCredit > 0) {
      openingBalances.set('Accounts Payable', {
        debit: 0,
        credit: openingAccrualsCredit,
        balance: -openingAccrualsCredit,
      });
    }

    // 4. Opening balance for Accounts Receivable (invoices before startDate that are still unpaid)
    const openingReceivablesQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        "'Accounts Receivable' AS accountName",
        'SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0)) AS debit',
        '0 AS credit',
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date < :startDate', { startDate })
      .andWhere('invoice.payment_status IN (:...statuses)', {
        statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
      });

    const openingReceivablesRow = await openingReceivablesQuery.getRawOne();
    const openingReceivablesDebit = Number(openingReceivablesRow?.debit || 0);
    if (openingReceivablesDebit > 0) {
      openingBalances.set('Accounts Receivable', {
        debit: openingReceivablesDebit,
        credit: 0,
        balance: openingReceivablesDebit,
      });
    }

    // 5. Opening balance for VAT Receivable
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
      .andWhere('expense.vat_amount > 0');

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

    // 6. Opening balance for VAT Payable
    const openingVatPayableQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        "'VAT Payable (Output VAT)' AS accountName",
        '0 AS debit',
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
    if (openingVatPayableCredit > 0) {
      openingBalances.set('VAT Payable (Output VAT)', {
        debit: 0,
        credit: openingVatPayableCredit,
        balance: -openingVatPayableCredit,
      });
    }

    // 7. Opening balance for Cash/Bank - Expense Payments
    const openingExpensePaymentsQuery = this.expensePaymentsRepository
      .createQueryBuilder('payment')
      .select([
        "'Cash/Bank - Payments' AS accountName",
        '0 AS debit',
        'SUM(COALESCE(payment.amount, 0)) AS credit',
      ])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date < :startDate', { startDate });

    const openingExpensePaymentsRow = await openingExpensePaymentsQuery.getRawOne();
    const openingExpensePaymentsCredit = Number(openingExpensePaymentsRow?.credit || 0);
    if (openingExpensePaymentsCredit > 0) {
      openingBalances.set('Cash/Bank - Payments', {
        debit: 0,
        credit: openingExpensePaymentsCredit,
        balance: -openingExpensePaymentsCredit,
      });
    }

    // 8. Opening balance for Cash/Bank - Invoice Payments
    const openingInvoicePaymentsQuery = this.invoicePaymentsRepository
      .createQueryBuilder('payment')
      .select([
        "'Cash/Bank - Receipts' AS accountName",
        'SUM(COALESCE(payment.amount, 0)) AS debit',
        '0 AS credit',
      ])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date < :startDate', { startDate });

    const openingInvoicePaymentsRow = await openingInvoicePaymentsQuery.getRawOne();
    const openingInvoicePaymentsDebit = Number(openingInvoicePaymentsRow?.debit || 0);
    if (openingInvoicePaymentsDebit > 0) {
      openingBalances.set('Cash/Bank - Receipts', {
        debit: openingInvoicePaymentsDebit,
        credit: 0,
        balance: openingInvoicePaymentsDebit,
      });
    }

    // 9. Opening balance for Journal Entries
    const openingJournalQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select([
        "CASE WHEN entry.category = 'equity' THEN 'Equity - ' || entry.type::text ELSE 'Other - ' || entry.category::text END AS accountName",
        "SUM(CASE WHEN entry.type = 'shareholder_account' THEN entry.amount ELSE 0 END) AS debit",
        "SUM(CASE WHEN entry.type IN ('share_capital', 'retained_earnings') THEN entry.amount ELSE 0 END) AS credit",
      ])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date < :startDate', { startDate })
      .groupBy('entry.category')
      .addGroupBy('entry.type');

    const openingJournalRows = await openingJournalQuery.getRawMany();
    openingJournalRows.forEach((row) => {
      const debit = Number(row.debit || 0);
      const credit = Number(row.credit || 0);
      if (debit > 0 || credit > 0) {
        openingBalances.set(row.accountname || row.accountName, {
          debit,
          credit,
          balance: debit - credit,
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

    // Add opening and closing balance to each account
    const accountsWithBalances = accounts.map((acc) => {
      const opening = openingBalances.get(acc.accountName) || { debit: 0, credit: 0, balance: 0 };
      return {
        ...acc,
        openingDebit: opening.debit,
        openingCredit: opening.credit,
        openingBalance: opening.balance,
        closingDebit: opening.debit + acc.debit,
        closingCredit: opening.credit + acc.credit,
        closingBalance: opening.balance + acc.balance,
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
      },
    };
  }

  /**
   * Balance Sheet Report
   * Shows Assets, Liabilities, and Equity
   * Includes: Expenses, Accounts Receivable, Cash/Bank, VAT, Accruals, Journal Entries
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

    // 1. Assets: Expenses by category (what we've spent)
    const expensesQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .leftJoin('expense.category', 'category')
      .select([
        "COALESCE(category.name, 'Uncategorized') AS category",
        'SUM(COALESCE(expense.base_amount, expense.amount)) AS amount',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date >= :startDate', { startDate })
      .andWhere('expense.expense_date <= :asOfDate', { asOfDate })
      .groupBy('category.name');

    if (filters?.['type']) {
      const types = Array.isArray(filters.type)
        ? filters.type
        : [filters.type];
      expensesQuery.andWhere('expense.type IN (:...types)', { types });
    }

    const expensesRows = await expensesQuery.getRawMany();
    expensesRows.forEach((row) => {
      const amount = Number(row.amount || 0);
      if (amount > 0) {
        assets.push({
          category: row.category,
          amount,
        });
        totalAssets += amount;
      }
    });

    // 2. Assets: Accounts Receivable (unpaid invoices as of asOfDate)
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

    const receivablesRow = await receivablesQuery.getRawOne();
    const receivablesAmount = Number(receivablesRow?.amount || 0);
    if (receivablesAmount > 0) {
      assets.push({
        category: 'Accounts Receivable',
        amount: receivablesAmount,
      });
      totalAssets += receivablesAmount;
    }

    // 3. Assets: Cash/Bank balances (net of payments)
    // Cash = Invoice Payments - Expense Payments (within period)
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

    const [invoicePaymentsRow, expensePaymentsRow] = await Promise.all([
      invoicePaymentsQuery.getRawOne(),
      expensePaymentsQuery.getRawOne(),
    ]);

    const receipts = Number(invoicePaymentsRow?.receipts || 0);
    const payments = Number(expensePaymentsRow?.payments || 0);
    const netCash = receipts - payments;
    if (netCash !== 0) {
      assets.push({
        category: 'Cash/Bank',
        amount: netCash,
      });
      totalAssets += netCash;
    }

    // 4. Assets: VAT Receivable (Input VAT from expenses)
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
      .andWhere('expense.vat_amount > 0');

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
    const liabilities: Array<{ vendor: string; amount: number; status: string }> = [];
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
    accrualsRows.forEach((row) => {
      const amount = Number(row.amount || 0);
      if (amount > 0) {
        liabilities.push({
          vendor: row.vendor || 'N/A',
          amount,
          status: row.status,
        });
        totalLiabilities += amount;
      }
    });

    // 2. Liabilities: VAT Payable (Output VAT from sales invoices)
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

    const vatPayableRow = await vatPayableQuery.getRawOne();
    const vatPayableAmount = Number(vatPayableRow?.amount || 0);
    if (vatPayableAmount > 0) {
      liabilities.push({
        vendor: 'VAT Payable (Output VAT)',
        amount: vatPayableAmount,
        status: 'Liability',
      });
      totalLiabilities += vatPayableAmount;
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

    // Get Journal Entries (equity items)
    const journalEntriesQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select([
        "SUM(CASE WHEN entry.type IN ('share_capital', 'retained_earnings') THEN entry.amount ELSE 0 END) AS equity",
        "SUM(CASE WHEN entry.type = 'shareholder_account' THEN entry.amount ELSE 0 END) AS shareholder",
      ])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date >= :startDate', { startDate })
      .andWhere('entry.entry_date <= :asOfDate', { asOfDate });

    const [revenueRow, creditNotesRow, debitNotesRow, journalRow] = await Promise.all([
      revenueQuery.getRawOne(),
      creditNotesQuery.getRawOne(),
      debitNotesQuery.getRawOne(),
      journalEntriesQuery.getRawOne(),
    ]);

    const totalRevenue = Number(revenueRow?.revenue || 0);
    const creditNotesAmount = Number(creditNotesRow?.creditNotes || 0);
    const debitNotesAmount = Number(debitNotesRow?.debitNotes || 0);
    const journalEquity = Number(journalRow?.equity || 0);
    const journalShareholder = Number(journalRow?.shareholder || 0);

    // Net revenue = Revenue - Credit Notes + Debit Notes
    const netRevenue = totalRevenue - creditNotesAmount + debitNotesAmount;
    
    // Equity = Net Revenue - Expenses + Journal Entries (equity increases, shareholder decreases)
    const totalEquity = netRevenue - totalAssets + journalEquity - journalShareholder;

    // Calculate opening balances (before startDate)
    // Opening Assets
    const openingExpensesQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select(['SUM(COALESCE(expense.base_amount, expense.amount)) AS amount'])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date < :startDate', { startDate });

    const openingReceivablesQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select(['SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0)) AS amount'])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date < :startDate', { startDate })
      .andWhere('invoice.payment_status IN (:...statuses)', {
        statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
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

    const openingVatReceivableQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select(['SUM(COALESCE(expense.vat_amount, 0)) AS amount'])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date < :startDate', { startDate })
      .andWhere('expense.vat_amount > 0');

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

    const openingJournalQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select([
        "SUM(CASE WHEN entry.type IN ('share_capital', 'retained_earnings') THEN entry.amount ELSE 0 END) AS equity",
        "SUM(CASE WHEN entry.type = 'shareholder_account' THEN entry.amount ELSE 0 END) AS shareholder",
      ])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date < :startDate', { startDate });

    const [
      openingExpensesRow,
      openingReceivablesRow,
      openingCashRow,
      openingExpensePaymentsRow,
      openingVatReceivableRow,
      openingAccrualsRow,
      openingVatPayableRow,
      openingRevenueRow,
      openingJournalRow,
    ] = await Promise.all([
      openingExpensesQuery.getRawOne(),
      openingReceivablesQuery.getRawOne(),
      openingCashQuery.getRawOne(),
      openingExpensePaymentsQuery.getRawOne(),
      openingVatReceivableQuery.getRawOne(),
      openingAccrualsQuery.getRawOne(),
      openingVatPayableQuery.getRawOne(),
      openingRevenueQuery.getRawOne(),
      openingJournalQuery.getRawOne(),
    ]);

    const openingExpenses = Number(openingExpensesRow?.amount || 0);
    const openingReceivables = Number(openingReceivablesRow?.amount || 0);
    const openingCashReceipts = Number(openingCashRow?.receipts || 0);
    const openingCashPayments = Number(openingExpensePaymentsRow?.payments || 0);
    const openingCash = openingCashReceipts - openingCashPayments;
    const openingVatReceivable = Number(openingVatReceivableRow?.amount || 0);
    const openingAssets = openingExpenses + openingReceivables + openingCash + openingVatReceivable;

    const openingAccruals = Number(openingAccrualsRow?.amount || 0);
    const openingVatPayable = Number(openingVatPayableRow?.amount || 0);
    const openingLiabilities = openingAccruals + openingVatPayable;

    const openingRevenue = Number(openingRevenueRow?.revenue || 0);
    const openingJournalEquity = Number(openingJournalRow?.equity || 0);
    const openingJournalShareholder = Number(openingJournalRow?.shareholder || 0);
    const openingEquity = openingRevenue - openingExpenses + openingJournalEquity - openingJournalShareholder;

    // Closing balances (opening + period)
    const closingAssets = openingAssets + totalAssets;
    const closingLiabilities = openingLiabilities + totalLiabilities;
    const closingEquity = openingEquity + totalEquity;

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
        revenue: Number(totalRevenue.toFixed(2)),
        creditNotes: Number(creditNotesAmount.toFixed(2)),
        debitNotes: Number(debitNotesAmount.toFixed(2)),
        netRevenue: Number(netRevenue.toFixed(2)),
        expenses: Number(totalAssets.toFixed(2)),
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

    const openingExpensesQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select(['SUM(COALESCE(expense.base_amount, expense.amount)) AS amount'])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date < :startDate', { startDate });

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
      // Default: show only unpaid/partial
      query.andWhere('invoice.payment_status IN (:...statuses)', {
        statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
      });
    }

    // Filter by invoice status
    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      query.andWhere('invoice.status IN (:...statuses)', { statuses });
    }

    // Filter by date range
    if (filters?.['startDate']) {
      query.andWhere('invoice.invoice_date >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters?.['endDate']) {
      query.andWhere('invoice.invoice_date <= :endDate', {
        endDate: filters.endDate,
      });
    }

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

    // Combine all items
    const allItems = [...invoiceItems, ...creditNoteItems, ...debitNoteItems];

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
        totalInvoices: invoiceItems.length,
        totalCreditNotes: creditNoteItems.length,
        totalDebitNotes: debitNoteItems.length,
        totalItems: allItems.length,
        totalOutstanding: Number(totalOutstanding.toFixed(2)),
        overdueInvoices: overdueItems.length,
        overdueAmount: Number(overdueAmount.toFixed(2)),
        paidInvoices: invoiceItems.filter(
          (i) => i.paymentStatus === PaymentStatus.PAID,
        ).length,
        unpaidInvoices: invoiceItems.filter(
          (i) => i.paymentStatus === PaymentStatus.UNPAID,
        ).length,
        partialInvoices: invoiceItems.filter(
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

    const vatOutputInvoices = await vatOutputQuery.getRawMany();

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

    // Calculate totals
    const totalVatInput = vatInputItems.reduce((sum, item) => sum + item.vatAmount, 0);
    const totalVatOutput = vatOutputItems.reduce((sum, item) => sum + item.vatAmount, 0);
    const netVat = totalVatOutput - totalVatInput;

    return {
      startDate,
      endDate,
      vatInputItems,
      vatOutputItems,
      summary: {
        vatInput: Number(totalVatInput.toFixed(2)),
        vatOutput: Number(totalVatOutput.toFixed(2)),
        netVat: Number(netVat.toFixed(2)),
        totalTransactions: vatInputItems.length + vatOutputItems.length,
        inputTransactions: vatInputItems.length,
        outputTransactions: vatOutputItems.length,
      },
    };
  }
}
