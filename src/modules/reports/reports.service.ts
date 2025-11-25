import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from '../../entities/expense.entity';
import { Accrual } from '../../entities/accrual.entity';
import { Report } from '../../entities/report.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { Organization } from '../../entities/organization.entity';
import { Attachment } from '../../entities/attachment.entity';
import { GenerateReportDto } from './dto/generate-report.dto';
import { ReportHistoryFilterDto } from './dto/report-history-filter.dto';
import { ReportType } from '../../common/enums/report-type.enum';
import { ExpenseStatus } from '../../common/enums/expense-status.enum';
import { ExpenseType } from '../../common/enums/expense-type.enum';
import { AccrualStatus } from '../../common/enums/accrual-status.enum';
import { Vendor } from '../vendors/vendor.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
    @InjectRepository(Accrual)
    private readonly accrualsRepository: Repository<Accrual>,
    @InjectRepository(Report)
    private readonly reportsRepository: Repository<Report>,
    @InjectRepository(AuditLog)
    private readonly auditLogsRepository: Repository<AuditLog>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(Attachment)
    private readonly attachmentsRepository: Repository<Attachment>,
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
    };
  }

  async generate(
    organizationId: string,
    userId: string,
    dto: GenerateReportDto,
  ): Promise<{ type: ReportType; generatedAt: Date; data: any; summary?: any }> {
    let data: any = null;
    let summary: any = null;
    switch (dto.type) {
      case ReportType.EXPENSE_SUMMARY:
        data = await this.buildExpenseSummary(organizationId, dto.filters);
        summary = await this.calculateExpenseSummary(data, organizationId, dto.filters);
        break;
      case ReportType.EXPENSE_DETAIL:
        data = await this.buildExpenseDetail(organizationId, dto.filters);
        summary = await this.calculateExpenseSummary(data, organizationId, dto.filters);
        break;
      case ReportType.ACCRUAL_REPORT:
        data = await this.buildAccrualSummary(organizationId, dto.filters);
        break;
      case ReportType.VAT_REPORT:
        data = await this.buildVatReport(organizationId, dto.filters);
        break;
      case ReportType.VENDOR_REPORT:
        data = await this.buildVendorReport(organizationId, dto.filters);
        break;
      case ReportType.EMPLOYEE_REPORT:
        data = await this.buildEmployeeReport(organizationId, dto.filters);
        break;
      case ReportType.TREND_REPORT:
        data = await this.buildTrendReport(organizationId, dto.filters);
        break;
      case ReportType.AUDIT_TRAIL:
        data = await this.buildAuditTrailReport(organizationId, dto.filters);
        break;
      case ReportType.BANK_RECONCILIATION:
        data = await this.buildBankReconciliation(organizationId, dto.filters);
        break;
      case ReportType.ATTACHMENTS_REPORT:
        data = await this.buildAttachmentsReport(organizationId, dto.filters);
        break;
      case ReportType.TRIAL_BALANCE:
        data = await this.buildTrialBalance(organizationId, dto.filters);
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

  private extractInvoiceNumber(text: string): string {
    if (!text) return 'N/A';
    // Try to extract invoice number patterns
    const patterns = [
      /(?:invoice|inv|receipt|bill)[\s#:]*([A-Z0-9\-]+)/i,
      /(?:bill\s*id|invoice\s*no|receipt\s*no)[\s:]*([A-Z0-9\-]+)/i,
      /#\s*([A-Z0-9\-]{4,})/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return 'N/A';
  }

  private async calculateExpenseSummary(
    expenses: any[],
    organizationId: string,
    filters?: Record<string, any>,
  ): Promise<any> {
    if (!expenses || expenses.length === 0) {
      return {
        totalExpenses: 0,
        totalAmountBeforeVat: 0,
        totalVatAmount: 0,
        totalAmountAfterVat: 0,
        averageExpenseAmount: 0,
      };
    }

    const totalExpenses = expenses.length;
    const totalAmountBeforeVat = expenses.reduce((sum, e) => sum + (e.amount || e.baseAmount || 0), 0);
    const totalVatAmount = expenses.reduce((sum, e) => sum + (e.vat || e.vatAmount || 0), 0);
    const totalAmountAfterVat = totalAmountBeforeVat + totalVatAmount;
    const averageExpenseAmount = totalExpenses > 0 ? totalAmountAfterVat / totalExpenses : 0;

    // Find highest category spend
    const categorySpend = new Map<string, number>();
    expenses.forEach((e) => {
      const category = e.category || 'Uncategorized';
      const amount = e.totalAmount || e.total || 0;
      categorySpend.set(category, (categorySpend.get(category) || 0) + amount);
    });
    let highestCategorySpend: { category: string; amount: number } | undefined;
    categorySpend.forEach((amount, category) => {
      if (!highestCategorySpend || amount > highestCategorySpend.amount) {
        highestCategorySpend = { category, amount };
      }
    });

    // Find top vendor
    const vendorSpend = new Map<string, number>();
    expenses.forEach((e) => {
      const vendor = e.vendor || 'N/A';
      const amount = e.totalAmount || e.total || 0;
      vendorSpend.set(vendor, (vendorSpend.get(vendor) || 0) + amount);
    });
    let topVendor: { vendor: string; amount: number } | undefined;
    vendorSpend.forEach((amount, vendor) => {
      if (!topVendor || amount > topVendor.amount) {
        topVendor = { vendor, amount };
      }
    });

    // Count credit notes and adjustments
    const totalCreditNotes = expenses.filter((e) => e.type === 'CREDIT_NOTE' || e.type === 'REFUND').length;
    const totalAdjustments = expenses.filter((e) => e.type === 'ADJUSTMENT').length;

    // Find user with highest upload count
    const userUploadCount = new Map<string, number>();
    expenses.forEach((e) => {
      const user = e.uploadedBy || 'Unknown';
      userUploadCount.set(user, (userUploadCount.get(user) || 0) + 1);
    });
    let userWithHighestUploadCount: { user: string; count: number } | undefined;
    userUploadCount.forEach((count, user) => {
      if (!userWithHighestUploadCount || count > userWithHighestUploadCount.count) {
        userWithHighestUploadCount = { user, count };
      }
    });

    return {
      totalExpenses,
      totalAmountBeforeVat,
      totalVatAmount,
      totalAmountAfterVat,
      averageExpenseAmount,
      highestCategorySpend,
      topVendor,
      totalCreditNotes,
      totalAdjustments,
      userWithHighestUploadCount,
    };
  }

  private async buildExpenseSummary(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    // Enhanced Expense Summary with all required columns
    const query = this.expensesRepository
      .createQueryBuilder('expense')
      .leftJoin('expense.category', 'category')
      .leftJoin('expense.user', 'user')
      .leftJoin('expense.vendor', 'vendor')
      .leftJoin('expense.attachments', 'attachments')
      .select([
        'expense.id AS expenseId',
        'expense.expense_date AS date',
        'COALESCE(category.name, \'Uncategorized\') AS category',
        'expense.type AS expenseType',
        'COALESCE(vendor.name, expense.vendor_name, \'N/A\') AS vendor',
        'COALESCE(expense.base_amount, expense.amount) AS amount',
        'expense.vat_amount AS vat',
        'COALESCE(expense.base_amount, expense.total_amount) + expense.vat_amount AS total',
        'expense.currency AS currency',
        'expense.exchange_rate AS exchangeRate',
        'expense.status AS status',
        'expense.description AS notes',
        'user.name AS uploadedBy',
        'expense.created_at AS uploadedAt',
        'COUNT(attachments.id) AS attachmentCount',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('(category.is_deleted = false OR category.id IS NULL)');
    
    // Apply enhanced filters
    this.applyExpenseFilters(query, filters);
    
    // Apply amount range filter if provided
    if (filters?.['minAmount']) {
      query.andWhere('expense.total_amount >= :minAmount', {
        minAmount: filters.minAmount,
      });
    }
    if (filters?.['maxAmount']) {
      query.andWhere('expense.total_amount <= :maxAmount', {
        maxAmount: filters.maxAmount,
      });
    }
    
    query.groupBy('expense.id')
      .addGroupBy('expense.expense_date')
      .addGroupBy('category.name')
      .addGroupBy('expense.type')
      .addGroupBy('vendor.name')
      .addGroupBy('expense.vendor_name')
      .addGroupBy('expense.base_amount')
      .addGroupBy('expense.amount')
      .addGroupBy('expense.vat_amount')
      .addGroupBy('expense.total_amount')
      .addGroupBy('expense.currency')
      .addGroupBy('expense.exchange_rate')
      .addGroupBy('expense.status')
      .addGroupBy('expense.description')
      .addGroupBy('user.name')
      .addGroupBy('expense.created_at')
      .orderBy('expense.expense_date', 'DESC');
    const rows = await query.getRawMany();
    
    // Return detailed rows for summary report with additional fields
    return rows.map((row) => ({
      date: row.date,
      category: row.category,
      type: row.expenseType, // Map expenseType to type for frontend compatibility
      expenseType: row.expenseType, // Keep for backward compatibility
      vendor: row.vendor || 'N/A',
      amount: Number(row.amount || 0), // Base amount (converted to base currency)
      baseAmount: Number(row.amount || 0), // Alias for baseAmount
      vatAmount: Number(row.vat || 0), // Map vat to vatAmount for frontend compatibility
      vat: Number(row.vat || 0), // Keep for backward compatibility
      totalAmount: Number(row.total || 0), // Map total to totalAmount for frontend compatibility
      total: Number(row.total || 0), // Keep for backward compatibility
      currency: row.currency || 'AED',
      exchangeRate: row.exchangeRate ? Number(row.exchangeRate) : null,
      status: row.status || 'PENDING',
      uploadedBy: row.uploadedBy || 'N/A',
      uploadedAt: row.uploadedAt ? new Date(row.uploadedAt).toISOString() : null,
      notes: row.notes || '',
      invoiceNumber: this.extractInvoiceNumber(row.notes || ''), // Extract from description if possible
      paymentMode: 'N/A', // Placeholder - not stored in DB yet
      project: 'N/A', // Placeholder - not stored in DB yet
      costCenter: 'N/A', // Placeholder - not stored in DB yet
      receiptAttached: Number(row.attachmentCount || 0) > 0 ? 'Yes' : 'No',
      attachmentCount: Number(row.attachmentCount || 0),
    }));
  }

  private async buildExpenseDetail(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    // Full line-item Expense Detail Report
    const query = this.expensesRepository
      .createQueryBuilder('expense')
      .leftJoin('expense.category', 'category')
      .leftJoin('expense.user', 'user')
      .leftJoin('expense.attachments', 'attachments')
      .select([
        'expense.id AS expenseId',
        'expense.expense_date AS date',
        'expense.description AS description',
        'COALESCE(category.name, \'Uncategorized\') AS category',
        'expense.type AS type',
        'expense.amount AS amount',
        'expense.vat_amount AS vat',
        'expense.total_amount AS total',
        'expense.status AS status',
        'user.name AS uploadedBy',
        'expense.vendor_name AS vendor',
        'expense.created_at AS uploadedAt',
        'COUNT(attachments.id) AS attachmentCount',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('(category.is_deleted = false OR category.id IS NULL)');
    
    // Apply enhanced filters
    this.applyExpenseFilters(query, filters);
    
    // Apply amount range filter if provided
    if (filters?.['minAmount']) {
      query.andWhere('expense.total_amount >= :minAmount', {
        minAmount: filters.minAmount,
      });
    }
    if (filters?.['maxAmount']) {
      query.andWhere('expense.total_amount <= :maxAmount', {
        maxAmount: filters.maxAmount,
      });
    }
    
    query.groupBy('expense.id')
      .addGroupBy('expense.expense_date')
      .addGroupBy('expense.description')
      .addGroupBy('category.name')
      .addGroupBy('expense.type')
      .addGroupBy('expense.amount')
      .addGroupBy('expense.vat_amount')
      .addGroupBy('expense.total_amount')
      .addGroupBy('expense.status')
      .addGroupBy('user.name')
      .addGroupBy('expense.vendor_name')
      .addGroupBy('expense.created_at')
      .orderBy('expense.expense_date', 'DESC');
    
    const rows = await query.getRawMany();
    
    // Get attachment details for each expense
    const expenseIds = rows.map((r) => r.expenseId);
    const attachments = await this.expensesRepository
      .createQueryBuilder('expense')
      .leftJoin('expense.attachments', 'attachments')
      .select([
        'expense.id AS expenseId',
        'attachments.file_name AS fileName',
        'attachments.file_url AS fileUrl',
      ])
      .where('expense.id IN (:...ids)', { ids: expenseIds })
      .andWhere('expense.organization_id = :organizationId', { organizationId })
      .getRawMany();
    
    const attachmentsMap = new Map<string, any[]>();
    attachments.forEach((att) => {
      if (att.fileName) {
        if (!attachmentsMap.has(att.expenseId)) {
          attachmentsMap.set(att.expenseId, []);
        }
        attachmentsMap.get(att.expenseId)?.push({
          fileName: att.fileName,
          fileUrl: att.fileUrl,
        });
      }
    });
    
    return rows.map((row) => ({
      expenseId: `EXP-${row.expenseId.substring(0, 8).toUpperCase()}`,
      date: row.date,
      description: row.description || 'N/A',
      category: row.category,
      type: row.type,
      amount: Number(row.amount || 0),
      vat: Number(row.vat || 0),
      total: Number(row.total || 0),
      status: row.status,
      uploadedBy: row.uploadedBy || 'N/A',
      vendor: row.vendor || 'N/A',
      attachments: attachmentsMap.get(row.expenseId) || [],
      attachmentCount: Number(row.attachmentCount || 0),
      invoiceNumber: this.extractInvoiceNumber(row.description || ''),
      paymentMode: 'N/A', // Placeholder
      project: 'N/A', // Placeholder
      costCenter: 'N/A', // Placeholder
      receiptAttached: Number(row.attachmentCount || 0) > 0 ? 'Yes' : 'No',
      notes: row.description || '',
      uploadedAt: row.uploadedAt ? new Date(row.uploadedAt).toISOString() : null,
    }));
  }

  private async buildAccrualSummary(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    // First get accruals grouped by status
    const query = this.accrualsRepository
      .createQueryBuilder('accrual')
      .select([
        'accrual.status AS status',
        'COUNT(accrual.id) AS count',
        'SUM(accrual.amount) AS amount',
      ])
      .where('accrual.organization_id = :organizationId', { organizationId })
      .andWhere('accrual.is_deleted = false');
    if (filters?.startDate) {
      query.andWhere('accrual.expected_payment_date >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters?.endDate) {
      query.andWhere('accrual.expected_payment_date <= :endDate', {
        endDate: filters.endDate,
      });
    }
    query.groupBy('accrual.status');
    const rows = await query.getRawMany();
    
    // Calculate overdue accruals separately
    const overdueQuery = this.accrualsRepository
      .createQueryBuilder('accrual')
      .select([
        'COUNT(accrual.id) AS overdueCount',
        'SUM(accrual.amount) AS overdueAmount',
      ])
      .where('accrual.organization_id = :organizationId', { organizationId })
      .andWhere('accrual.is_deleted = false')
      .andWhere('accrual.status = :status', { status: AccrualStatus.PENDING_SETTLEMENT })
      .andWhere('accrual.expected_payment_date < CURRENT_DATE');
    const overdueResult = await overdueQuery.getRawOne<{ overdueCount: string; overdueAmount: string }>();
    const overdueCount = Number(overdueResult?.overdueCount ?? 0);
    const overdueAmount = Number(overdueResult?.overdueAmount ?? 0);
    
    const summary = Object.values(AccrualStatus).map((status) => {
      const row = rows.find((r) => r.status === status);
      return {
        status,
        count: row ? Number(row.count) : 0,
        amount: row ? Number(row.amount) : 0,
        overdueCount: status === AccrualStatus.PENDING_SETTLEMENT ? overdueCount : 0,
        overdueAmount: status === AccrualStatus.PENDING_SETTLEMENT ? overdueAmount : 0,
      };
    });
    return summary;
  }

  private async buildVatReport(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    // Get organization details for UAE compliance
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });

    // Input VAT (VAT paid on expenses - this is what we can claim back)
    // Include all expense types: expense, adjustment, advance, accrual, fixed_assets, cost_of_sales
    // EXCLUDE credits (sales) - those have output VAT, not input VAT
    const inputVatQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select([
        'SUM(COALESCE(expense.base_amount, expense.amount)) AS taxableAmount',
        'SUM(expense.vat_amount) AS inputVat',
        'COUNT(expense.id) AS transactionCount',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.type IN (:...types)', {
        types: [
          ExpenseType.EXPENSE,
          ExpenseType.ADJUSTMENT,
          ExpenseType.ADVANCE,
          ExpenseType.ACCRUAL,
          ExpenseType.FIXED_ASSETS,
          ExpenseType.COST_OF_SALES,
        ],
      });
    
    this.applyExpenseFilters(inputVatQuery, filters);
    const inputVatResult = await inputVatQuery.getRawOne();
    const inputVat = Number(inputVatResult?.inputVat ?? 0);
    const taxableSupplies = Number(inputVatResult?.taxableAmount ?? 0);
    
    // Output VAT (VAT collected on sales/revenue - credits)
    // Calculate VAT from credit (sales) transactions
    const outputVatQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select([
        'SUM(COALESCE(expense.base_amount, expense.amount)) AS taxableSales',
        'SUM(expense.vat_amount) AS outputVat',
        'COUNT(expense.id) AS salesCount',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.type = :type', { type: ExpenseType.CREDIT });
    
    this.applyExpenseFilters(outputVatQuery, filters);
    const outputVatResult = await outputVatQuery.getRawOne();
    const outputVat = Number(outputVatResult?.outputVat ?? 0);
    const taxableSales = Number(outputVatResult?.taxableSales ?? 0);
    
    // Net VAT Payable = Output VAT - Input VAT
    // Positive = payable to tax authority, Negative = refundable
    const netVatPayable = outputVat - inputVat;
    
    // UAE VAT standard rate is 5%
    const standardVatRate = 0.05;
    const calculatedVat = taxableSupplies * standardVatRate;
    const vatDifference = inputVat - calculatedVat;
    
    return {
      // Organization details for compliance
      organizationName: organization?.name || '',
      vatNumber: organization?.vatNumber || '',
      address: organization?.address || '',
      currency: organization?.currency || 'AED',
      reportPeriod: {
        startDate: filters?.['startDate'] || null,
        endDate: filters?.['endDate'] || null,
      },
      // VAT summary with Input/Output breakdown
      period: filters?.['startDate'] && filters?.['endDate'] 
        ? `${filters.startDate} to ${filters.endDate}`
        : 'All Time',
      taxableSupplies: Number(taxableSupplies.toFixed(2)), // Expenses (input VAT base)
      taxableSales: Number(taxableSales.toFixed(2)), // Sales (output VAT base)
      outputVat: Number(outputVat.toFixed(2)), // VAT collected on sales
      inputVat: Number(inputVat.toFixed(2)), // VAT paid on expenses
      netVatPayable: Number(netVatPayable.toFixed(2)), // Net amount payable/refundable
      status: 'Pending', // Can be 'Submitted' or 'Pending'
      transactionCount: Number(inputVatResult?.transactionCount ?? 0),
      salesCount: Number(outputVatResult?.salesCount ?? 0),
      // Legacy fields for backward compatibility (using total taxable amount)
      taxableAmount: taxableSupplies + taxableSales, // Total taxable transactions
      vatAmount: netVatPayable, // Net VAT payable (for dashboard display)
      totalAmount: taxableSupplies + taxableSales + inputVat + outputVat,
      vatPercentage:
        taxableSupplies > 0
          ? (inputVat / taxableSupplies) * 100
          : 0, // Input VAT percentage
      outputVatPercentage:
        taxableSales > 0
          ? (outputVat / taxableSales) * 100
          : 0, // Output VAT percentage
      standardVatRate: standardVatRate * 100, // 5%
      calculatedVat,
      vatDifference,
      // Breakdown by category for detailed reporting
      categoryBreakdown: await this.getVatCategoryBreakdown(organizationId, filters),
    };
  }

  private async getVatCategoryBreakdown(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    // Get breakdown for expenses (Input VAT)
    const expenseQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .leftJoin('expense.category', 'category')
      .select([
        'COALESCE(category.name, \'Uncategorized\') AS category',
        'SUM(COALESCE(expense.base_amount, expense.amount)) AS taxableAmount',
        'SUM(expense.vat_amount) AS vatAmount',
        'COUNT(expense.id) AS count',
        '\'expense\' AS transactionType',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('(category.is_deleted = false OR category.id IS NULL)')
      .andWhere('expense.type IN (:...types)', {
        types: [
          ExpenseType.EXPENSE,
          ExpenseType.ADJUSTMENT,
          ExpenseType.ADVANCE,
          ExpenseType.ACCRUAL,
          ExpenseType.FIXED_ASSETS,
          ExpenseType.COST_OF_SALES,
        ],
      });
    
    this.applyExpenseFilters(expenseQuery, filters);
    expenseQuery.groupBy('category.name');
    
    // Get breakdown for sales (Output VAT)
    const salesQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .leftJoin('expense.category', 'category')
      .select([
        'COALESCE(category.name, \'Sales\') AS category',
        'SUM(COALESCE(expense.base_amount, expense.amount)) AS taxableAmount',
        'SUM(expense.vat_amount) AS vatAmount',
        'COUNT(expense.id) AS count',
        '\'credit\' AS transactionType',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('(category.is_deleted = false OR category.id IS NULL)')
      .andWhere('expense.type = :type', { type: ExpenseType.CREDIT });
    
    this.applyExpenseFilters(salesQuery, filters);
    salesQuery.groupBy('category.name');
    
    const [expenseRows, salesRows] = await Promise.all([
      expenseQuery.getRawMany(),
      salesQuery.getRawMany(),
    ]);
    
    // Combine and format results
    const allRows = [
      ...expenseRows.map((row) => ({
        category: row.category,
        taxableAmount: Number(row.taxableAmount || 0),
        vatAmount: Number(row.vatAmount || 0),
        totalAmount: Number(row.taxableAmount || 0) + Number(row.vatAmount || 0),
        transactionCount: Number(row.count || 0),
        transactionType: row.transactionType,
        vatType: 'input' as const,
      })),
      ...salesRows.map((row) => ({
        category: row.category,
        taxableAmount: Number(row.taxableAmount || 0),
        vatAmount: Number(row.vatAmount || 0),
        totalAmount: Number(row.taxableAmount || 0) + Number(row.vatAmount || 0),
        transactionCount: Number(row.count || 0),
        transactionType: row.transactionType,
        vatType: 'output' as const,
      })),
    ];
    
    return allRows;
  }

  private async buildVendorReport(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    const query = this.expensesRepository
      .createQueryBuilder('expense')
      .select([
        'expense.vendor_name AS vendorName',
        'SUM(expense.amount) AS amount',
        'SUM(expense.vat_amount) AS vatAmount',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.type IN (:...types)', {
        types: [ExpenseType.EXPENSE, ExpenseType.ADVANCE],
      });
    
    // Apply enhanced filters (excluding vendor filter since we're grouping by vendor)
    const filtersWithoutVendor = { ...filters };
    delete filtersWithoutVendor?.vendorName;
    this.applyExpenseFilters(query, filtersWithoutVendor);
    
    // If no status filter is provided, include all statuses by default
    if (!filtersWithoutVendor?.['status']) {
      // Include all statuses
    }
    
    query.groupBy('expense.vendor_name')
      .orderBy('amount', 'DESC');
    const rows = await query.getRawMany();
    return rows
      .filter((row) => row.vendorName)
      .map((row) => ({
        vendorName: row.vendorName,
        amount: Number(row.amount),
        vatAmount: Number(row.vatAmount),
      }));
  }

  private async buildEmployeeReport(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    const query = this.expensesRepository
      .createQueryBuilder('expense')
      .leftJoin('expense.user', 'user')
      .select([
        'user.name AS userName',
        'user.email AS userEmail',
        'SUM(expense.amount) AS amount',
        'SUM(expense.vat_amount) AS vatAmount',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false');
    
    // Apply enhanced filters (excluding userId filter since we're grouping by user)
    const filtersWithoutUser = { ...filters };
    delete filtersWithoutUser?.userId;
    this.applyExpenseFilters(query, filtersWithoutUser);
    
    // If no status filter is provided, include all statuses by default
    if (!filtersWithoutUser?.['status']) {
      // Include all statuses
    }
    
    query.groupBy('user.name')
      .addGroupBy('user.email')
      .orderBy('amount', 'DESC');
    const rows = await query.getRawMany();
    return rows.map((row) => ({
      userName: row.userName,
      userEmail: row.userEmail,
      amount: Number(row.amount),
      vatAmount: Number(row.vatAmount),
    }));
  }

  private async buildTrendReport(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    const query = this.expensesRepository
      .createQueryBuilder('expense')
      .select([
        "TO_CHAR(expense.expense_date, 'YYYY-MM') AS period",
        'SUM(expense.total_amount) AS totalAmount',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false');
    
    // Apply enhanced filters
    this.applyExpenseFilters(query, filters);
    
    query.groupBy("TO_CHAR(expense.expense_date, 'YYYY-MM')")
      .orderBy("TO_CHAR(expense.expense_date, 'YYYY-MM')", 'ASC');
    const rows = await query.getRawMany();
    return rows.map((row) => ({
      period: row.period,
      totalAmount: Number(row.totalAmount),
    }));
  }

  /**
   * Helper method to apply common expense filters to query builders
   */
  private applyExpenseFilters(
    query: any,
    filters?: Record<string, any>,
  ): void {
    if (filters?.startDate) {
      query.andWhere('expense.expense_date >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters?.endDate) {
      query.andWhere('expense.expense_date <= :endDate', {
        endDate: filters.endDate,
      });
    }
    if (filters?.categoryId) {
      if (Array.isArray(filters.categoryId)) {
        query.andWhere('expense.category_id IN (:...categoryIds)', {
          categoryIds: filters.categoryId,
        });
      } else {
        query.andWhere('expense.category_id = :categoryId', {
          categoryId: filters.categoryId,
        });
      }
    }
    if (filters?.vendorName) {
      if (Array.isArray(filters.vendorName)) {
        query.andWhere('expense.vendor_name IN (:...vendorNames)', {
          vendorNames: filters.vendorName,
        });
      } else {
        query.andWhere('expense.vendor_name = :vendorName', {
          vendorName: filters.vendorName,
        });
      }
    }
    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        query.andWhere('expense.status IN (:...statuses)', {
          statuses: filters.status,
        });
      } else {
        query.andWhere('expense.status = :status', {
          status: filters.status,
        });
      }
    }
    if (filters?.type) {
      if (Array.isArray(filters.type)) {
        query.andWhere('expense.type IN (:...types)', {
          types: filters.type,
        });
      } else {
        query.andWhere('expense.type = :type', {
          type: filters.type,
        });
      }
    }
    if (filters?.userId) {
      if (Array.isArray(filters.userId)) {
        query.andWhere('expense.user_id IN (:...userIds)', {
          userIds: filters.userId,
        });
      } else {
        query.andWhere('expense.user_id = :userId', {
          userId: filters.userId,
        });
      }
    }
  }

  private async buildAuditTrailReport(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    const query = this.auditLogsRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .select([
        'log.id AS id',
        'log.entity_type AS entityType',
        'log.entity_id AS entityId',
        'log.action AS action',
        'log.changes AS changes',
        'log.ip_address AS ipAddress',
        'log.timestamp AS timestamp',
        'user.name AS userName',
        'user.email AS userEmail',
      ])
      .where('log.organization_id = :organizationId', { organizationId });

    if (filters?.['startDate']) {
      query.andWhere('log.timestamp >= :startDate', {
        startDate: filters['startDate'],
      });
    }
    if (filters?.['endDate']) {
      query.andWhere('log.timestamp <= :endDate', {
        endDate: filters['endDate'],
      });
    }
    if (filters?.['entityType']) {
      if (Array.isArray(filters['entityType'])) {
        query.andWhere('log.entity_type IN (:...entityTypes)', {
          entityTypes: filters['entityType'],
        });
      } else {
        query.andWhere('log.entity_type = :entityType', {
          entityType: filters['entityType'],
        });
      }
    }
    if (filters?.['userId']) {
      if (Array.isArray(filters['userId'])) {
        query.andWhere('log.user_id IN (:...userIds)', {
          userIds: filters['userId'],
        });
      } else {
        query.andWhere('log.user_id = :userId', {
          userId: filters['userId'],
        });
      }
    }
    if (filters?.['action']) {
      if (Array.isArray(filters['action'])) {
        query.andWhere('log.action IN (:...actions)', {
          actions: filters['action'],
        });
      } else {
        query.andWhere('log.action = :action', {
          action: filters['action'],
        });
      }
    }

    query.orderBy('log.timestamp', 'DESC');
    const rows = await query.getRawMany();
    return rows.map((row) => {
      const changes = row.changes || {};
      const oldValue = changes.oldValue || changes.before || '';
      const newValue = changes.newValue || changes.after || '';
      
      return {
        id: row.id,
        timestamp: row.timestamp,
        entityType: row.entityType,
        entityId: row.entityId,
        action: row.action,
        userName: row.userName || 'System',
        userEmail: row.userEmail || '',
        ipAddress: row.ipAddress || '',
        oldValue: typeof oldValue === 'object' ? JSON.stringify(oldValue) : String(oldValue),
        newValue: typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue),
        changes: changes,
      };
    });
  }

  private async buildBankReconciliation(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    // Bank Reconciliation Summary Report
    // For now, we'll use accruals and expenses to simulate reconciliation
    const startDate = filters?.['startDate'] || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = filters?.['endDate'] || new Date().toISOString().split('T')[0];
    
    // Get all expenses in the date range
    const expensesQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .leftJoin('expense.accrualDetail', 'accrual')
      .select([
        'expense.id AS expenseId',
        'expense.expense_date AS date',
        'expense.description AS description',
        'expense.total_amount AS amount',
        'expense.status AS status',
        'CASE WHEN accrual.id IS NOT NULL THEN \'Matched\' ELSE \'Unmatched\' END AS reconciliationStatus',
        'accrual.id AS accrualId',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date >= :startDate', { startDate })
      .andWhere('expense.expense_date <= :endDate', { endDate });
    
    if (filters?.['status']) {
      const status = filters.status;
      if (status === 'matched') {
        expensesQuery.andWhere('accrual.id IS NOT NULL');
      } else if (status === 'unmatched') {
        expensesQuery.andWhere('accrual.id IS NULL');
      }
    }
    
    const transactions = await expensesQuery.getRawMany();
    
    const matched = transactions.filter((t) => t.reconciliationStatus === 'Matched');
    const unmatched = transactions.filter((t) => t.reconciliationStatus === 'Unmatched');
    
    // Calculate totals
    const totalTransactions = transactions.length;
    const matchedCount = matched.length;
    const unmatchedCount = unmatched.length;
    
    const closingBalanceBank = transactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const closingBalanceSystem = transactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const variance = closingBalanceBank - closingBalanceSystem;
    
    return {
      reconciliationId: `REC-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-01`,
      dateRange: {
        startDate,
        endDate,
      },
      bankAccount: filters?.['bankAccount'] || 'Default Bank Account',
      totalTransactions,
      matched: matchedCount,
      unmatched: unmatchedCount,
      adjustments: 0, // Placeholder for adjustments
      closingBalanceBank: Number(closingBalanceBank.toFixed(2)),
      closingBalanceSystem: Number(closingBalanceSystem.toFixed(2)),
      variance: Number(variance.toFixed(2)),
      transactions: transactions.map((t) => ({
        date: t.date,
        description: t.description || 'N/A',
        amount: Number(t.amount || 0),
        status: t.reconciliationStatus,
        linkedExpenseId: `EXP-${t.expenseId.substring(0, 8).toUpperCase()}`,
      })),
    };
  }

  private async buildAttachmentsReport(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    // Attachments Report - List all supporting documents
    const query = this.attachmentsRepository
      .createQueryBuilder('attachment')
      .leftJoin('attachment.expense', 'expense')
      .leftJoin('attachment.uploadedBy', 'user')
      .select([
        'attachment.file_name AS fileName',
        'attachment.file_url AS fileUrl',
        'attachment.file_type AS fileType',
        'attachment.file_size AS fileSize',
        'attachment.created_at AS uploadedDate',
        'expense.id AS linkedRecordId',
        'user.name AS uploadedBy',
      ])
      .where('attachment.organization_id = :organizationId', { organizationId });
    
    if (filters?.['startDate']) {
      query.andWhere('attachment.created_at >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters?.['endDate']) {
      query.andWhere('attachment.created_at <= :endDate', {
        endDate: filters.endDate,
      });
    }
    if (filters?.['uploadedBy']) {
      if (Array.isArray(filters.uploadedBy)) {
        query.andWhere('attachment.uploaded_by IN (:...userIds)', {
          userIds: filters.uploadedBy,
        });
      } else {
        query.andWhere('attachment.uploaded_by = :userId', {
          userId: filters.uploadedBy,
        });
      }
    }
    if (filters?.['fileType']) {
      query.andWhere('attachment.file_type = :fileType', {
        fileType: filters.fileType,
      });
    }
    
    query.orderBy('attachment.created_at', 'DESC');
    const rows = await query.getRawMany();
    
    return rows.map((row) => ({
      fileName: row.fileName,
      linkedRecord: `EXP-${row.linkedRecordId?.substring(0, 8).toUpperCase() || 'N/A'}`,
      type: 'Expense',
      uploadedBy: row.uploadedBy || 'N/A',
      uploadedDate: row.uploadedDate,
      fileSize: `${(Number(row.fileSize || 0) / 1024).toFixed(2)} KB`,
      fileSizeBytes: Number(row.fileSize || 0),
      fileType: row.fileType || 'N/A',
      storagePath: row.fileUrl || 'N/A',
      fileUrl: row.fileUrl,
    }));
  }

  private async buildTrialBalance(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    // Trial Balance / Account Summary Report
    const startDate = filters?.['startDate'] || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const endDate = filters?.['endDate'] || new Date().toISOString().split('T')[0];
    
    // Get expense totals by category
    const expenseQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .leftJoin('expense.category', 'category')
      .select([
        'COALESCE(category.name, \'Uncategorized\') AS accountName',
        'SUM(expense.amount) AS debit',
        '0 AS credit',
        '\'Expense\' AS accountType',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date >= :startDate', { startDate })
      .andWhere('expense.expense_date <= :endDate', { endDate })
      .groupBy('category.name');
    
    const expenseRows = await expenseQuery.getRawMany();
    
    // Format as trial balance entries
    const accounts = expenseRows.map((row) => ({
      accountName: row.accountName,
      accountType: row.accountType,
      debit: Number(row.debit || 0),
      credit: Number(row.credit || 0),
      balance: Number(row.debit || 0) - Number(row.credit || 0),
    }));
    
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
}

