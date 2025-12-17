import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from '../../entities/expense.entity';
import { Accrual } from '../../entities/accrual.entity';
import { Report } from '../../entities/report.entity';
import { Organization } from '../../entities/organization.entity';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { GenerateReportDto } from './dto/generate-report.dto';
import { ReportHistoryFilterDto } from './dto/report-history-filter.dto';
import { ReportType } from '../../common/enums/report-type.enum';
import { ExpenseType } from '../../common/enums/expense-type.enum';
import { AccrualStatus } from '../../common/enums/accrual-status.enum';
import { PaymentStatus } from '../../common/enums/payment-status.enum';
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
      vendors: vendorResults
        .map((r) => r.vendorName)
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
      default:
        data = {};
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

    // Get expenses grouped by category (debits)
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

    // Get sales invoices (credits/revenue)
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

    // Combine accounts
    const accounts = [
      ...expenseRows.map((row) => ({
        accountName: row.accountName,
        accountType: row.accountType,
        debit: Number(row.debit || 0),
        credit: Number(row.credit || 0),
        balance: Number(row.debit || 0) - Number(row.credit || 0),
      })),
      ...(revenueRow && Number(revenueRow.credit || 0) > 0
        ? [
            {
              accountName: revenueRow.accountName,
              accountType: revenueRow.accountType,
              debit: Number(revenueRow.debit || 0),
              credit: Number(revenueRow.credit || 0),
              balance: Number(revenueRow.debit || 0) - Number(revenueRow.credit || 0),
            },
          ]
        : []),
    ];

    const totalDebit = accounts.reduce((sum, acc) => sum + acc.debit, 0);
    const totalCredit = accounts.reduce((sum, acc) => sum + acc.credit, 0);
    const totalBalance = totalDebit - totalCredit;

    return {
      period: {
        startDate,
        endDate,
      },
      accounts,
      summary: {
        totalDebit: Number(totalDebit.toFixed(2)),
        totalCredit: Number(totalCredit.toFixed(2)),
        totalBalance: Number(totalBalance.toFixed(2)),
        accountCount: accounts.length,
      },
    };
  }

  /**
   * Balance Sheet Report
   * Shows Assets, Liabilities, and Equity
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

    // Assets: Expenses (what we've spent)
    const assetsQuery = this.expensesRepository
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
      assetsQuery.andWhere('expense.type IN (:...types)', { types });
    }

    const assetsRows = await assetsQuery.getRawMany();
    const totalAssets = assetsRows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );

    // Liabilities: Unpaid accruals (what we owe)
    const liabilitiesQuery = this.accrualsRepository
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
      .groupBy('accrual.vendor_name')
      .addGroupBy('accrual.status');

    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      liabilitiesQuery.andWhere('accrual.status IN (:...statuses)', {
        statuses,
      });
    }

    const liabilitiesRows = await liabilitiesQuery.getRawMany();
    const totalLiabilities = liabilitiesRows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );

    // Equity: Revenue - Expenses
    const revenueQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        'SUM(COALESCE(invoice.base_amount, invoice.amount)) AS revenue',
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date >= :startDate', { startDate })
      .andWhere('invoice.invoice_date <= :asOfDate', { asOfDate });

    const revenueRow = await revenueQuery.getRawOne();
    const totalRevenue = Number(revenueRow?.revenue || 0);
    const totalEquity = totalRevenue - totalAssets;

    return {
      asOfDate,
      period: {
        startDate,
        endDate: asOfDate,
      },
      assets: {
        items: assetsRows.map((row) => ({
          category: row.category,
          amount: Number(row.amount || 0),
        })),
        total: Number(totalAssets.toFixed(2)),
      },
      liabilities: {
        items: liabilitiesRows.map((row) => ({
          vendor: row.vendor || 'N/A',
          amount: Number(row.amount || 0),
          status: row.status,
        })),
        total: Number(totalLiabilities.toFixed(2)),
      },
      equity: {
        revenue: Number(totalRevenue.toFixed(2)),
        expenses: Number(totalAssets.toFixed(2)),
        net: Number(totalEquity.toFixed(2)),
      },
      summary: {
        totalAssets: Number(totalAssets.toFixed(2)),
        totalLiabilities: Number(totalLiabilities.toFixed(2)),
        totalEquity: Number(totalEquity.toFixed(2)),
        balance: Number(
          (totalAssets - totalLiabilities - totalEquity).toFixed(2),
        ),
      },
    };
  }

  /**
   * Profit and Loss Statement
   * Shows Revenue and Expenses for a period
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

    const revenueResult = await revenueQuery.getRawOne();
    const totalRevenue = Number(revenueResult?.revenue || 0);
    const revenueVat = Number(revenueResult?.vat || 0);

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

    const netProfit = totalRevenue - totalExpenses;

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
        grossProfit: Number(totalRevenue.toFixed(2)),
        totalExpenses: Number(totalExpenses.toFixed(2)),
        netProfit: Number(netProfit.toFixed(2)),
        netProfitMargin:
          totalRevenue > 0
            ? Number(((netProfit / totalRevenue) * 100).toFixed(2))
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

    // Calculate overdue items
    const overdueItems = rows.filter(
      (row) =>
        row.status === AccrualStatus.PENDING_SETTLEMENT &&
        row.expectedDate &&
        new Date(row.expectedDate) < new Date(asOfDate),
    );

    const totalAmount = rows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );
    const overdueAmount = overdueItems.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );

    return {
      asOfDate,
      items: rows.map((row) => ({
        accrualId: row.accrualId,
        vendor: row.vendor || 'N/A',
        amount: Number(row.amount || 0),
        expectedDate: row.expectedDate,
        settlementDate: row.settlementDate,
        status: row.status,
        category: row.category,
        description: row.description || 'N/A',
        isOverdue:
          row.status === AccrualStatus.PENDING_SETTLEMENT &&
          row.expectedDate &&
          new Date(row.expectedDate) < new Date(asOfDate),
      })),
      summary: {
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
   */
  private async buildReceivables(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    const asOfDate =
      filters?.['endDate'] || new Date().toISOString().split('T')[0];

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

    // Calculate outstanding amounts and overdue items
    const items = rows.map((row) => {
      const total = Number(row.total || 0);
      const paid = Number(row.paidAmount || 0);
      const outstanding = total - paid;
      const isOverdue =
        row.paymentStatus !== PaymentStatus.PAID &&
        row.dueDate &&
        new Date(row.dueDate) < new Date(asOfDate);

      return {
        invoiceId: row.invoiceId,
        invoiceNumber: row.invoiceNumber,
        customer: row.customer,
        amount: Number(row.amount || 0),
        vat: Number(row.vat || 0),
        total: total,
        paid: paid,
        outstanding: outstanding,
        invoiceDate: row.invoiceDate,
        dueDate: row.dueDate,
        paidDate: row.paidDate,
        status: row.status,
        paymentStatus: row.paymentStatus,
        isOverdue,
      };
    });

    const overdueItems = items.filter((item) => item.isOverdue);
    const totalOutstanding = items.reduce(
      (sum, item) => sum + item.outstanding,
      0,
    );
    const overdueAmount = overdueItems.reduce(
      (sum, item) => sum + item.outstanding,
      0,
    );

    return {
      asOfDate,
      items,
      summary: {
        totalInvoices: items.length,
        totalOutstanding: Number(totalOutstanding.toFixed(2)),
        overdueInvoices: overdueItems.length,
        overdueAmount: Number(overdueAmount.toFixed(2)),
        paidInvoices: items.filter(
          (i) => i.paymentStatus === PaymentStatus.PAID,
        ).length,
        unpaidInvoices: items.filter(
          (i) => i.paymentStatus === PaymentStatus.UNPAID,
        ).length,
        partialInvoices: items.filter(
          (i) => i.paymentStatus === PaymentStatus.PARTIAL,
        ).length,
      },
    };
  }
}
