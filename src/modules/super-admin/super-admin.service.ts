import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, DataSource } from 'typeorm';
import { Organization } from '../../entities/organization.entity';
import { Expense } from '../../entities/expense.entity';
import { User } from '../../entities/user.entity';
import { Attachment } from '../../entities/attachment.entity';
import { Accrual } from '../../entities/accrual.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { ExpensePayment } from '../../entities/expense-payment.entity';
import { InvoicePayment } from '../../entities/invoice-payment.entity';
import { PaymentAllocation } from '../../entities/payment-allocation.entity';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { CreditNote } from '../../entities/credit-note.entity';
import { DebitNote } from '../../entities/debit-note.entity';
import { CreditNoteApplication } from '../../entities/credit-note-application.entity';
import { DebitNoteApplication } from '../../entities/debit-note-application.entity';
import { JournalEntry } from '../../entities/journal-entry.entity';
import { Category } from '../../entities/category.entity';
import { ExpenseType } from '../../entities/expense-type.entity';
import { Vendor } from '../vendors/vendor.entity';
import { Report } from '../../entities/report.entity';
import { Notification } from '../../entities/notification.entity';
import { ExchangeRate } from '../../entities/exchange-rate.entity';
import { InvoiceLineItem } from '../../entities/invoice-line-item.entity';
import { PurchaseLineItem } from '../../entities/purchase-line-item.entity';
import { AccrualStatus } from '../../common/enums/accrual-status.enum';
import { OrganizationStatus } from '../../common/enums/organization-status.enum';
import { LicenseKeysService } from '../license-keys/license-keys.service';
import { CategoriesService } from '../categories/categories.service';
import { Product } from '../products/product.entity';
import { StockMovement } from '../inventory/entities/stock-movement.entity';
import { InventoryLocation } from '../inventory/entities/inventory-location.entity';
import { StockAdjustment } from '../inventory/entities/stock-adjustment.entity';
import { StockAdjustmentItem } from '../inventory/entities/stock-adjustment-item.entity';
import { Customer } from '../customers/customer.entity';
import { TaxRate } from '../../entities/tax-rate.entity';
import { TaxRule } from '../../entities/tax-rule.entity';
import { OrganizationSettings } from '../../entities/organization-settings.entity';
import { NumberingSequence } from '../../entities/numbering-sequence.entity';
import { BankTransaction } from '../../entities/bank-transaction.entity';
import { SystemTransaction } from '../../entities/system-transaction.entity';
import { ReconciliationRecord } from '../../entities/reconciliation-record.entity';
import { EmailTemplate } from '../../entities/email-template.entity';
import { LicenseKey } from '../../entities/license-key.entity';
import { PayrollRun } from '../payroll/entities/payroll-run.entity';
import { PayrollEntry } from '../payroll/entities/payroll-entry.entity';
import { PayrollEntryDetail } from '../payroll/entities/payroll-entry-detail.entity';
import { EmployeeSalaryProfile } from '../payroll/entities/employee-salary-profile.entity';
import { SalaryComponent } from '../payroll/entities/salary-component.entity';
import { CategoryTaxRule } from '../../entities/category-tax-rule.entity';
import { PurchaseOrder } from '../../entities/purchase-order.entity';
import { PurchaseOrderLineItem } from '../../entities/purchase-order-line-item.entity';

// Cache TTL: 5 minutes (300000 ms)
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheItem<T> {
  data: T;
  timestamp: number;
}

export interface DashboardMetrics {
  totalOrganizations: number;
  activeOrganizations: number;
  inactiveOrganizations: number;
  totalUsers: number;
  totalExpensesProcessed: number;
  totalAccruals: number;
  pendingAccruals: number;
  storageUsedMb: number;
  latestAuditLogs: Array<{
    id: string;
    organizationId: string;
    entityType: string;
    action: string;
    timestamp: string;
  }>;
}

export interface OrganizationUsageItem {
  id: string;
  name: string;
  planType: string;
  status: string;
  userCount: number;
  expenseCount: number;
  accrualCount: number;
  storageUsedMb: number;
  rankingScore: number; // Combined score for sorting
  createdAt: Date;
  licenseExpiresAt?: Date | null;
  enablePayroll?: boolean;
  enableInventory?: boolean;
  enableBulkJournalImport?: boolean;
}

@Injectable()
export class SuperAdminService {
  private dashboardMetricsCache: CacheItem<DashboardMetrics> | null = null;
  private organizationUsageCache: CacheItem<OrganizationUsageItem[]> | null =
    null;

  constructor(
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Attachment)
    private readonly attachmentsRepository: Repository<Attachment>,
    @InjectRepository(Accrual)
    private readonly accrualsRepository: Repository<Accrual>,
    @InjectRepository(AuditLog)
    private readonly auditLogsRepository: Repository<AuditLog>,
    private readonly licenseKeysService: LicenseKeysService,
    private readonly categoriesService: CategoriesService,
    private readonly dataSource: DataSource,
  ) {}

  private isCacheValid<T>(cache: CacheItem<T> | null): boolean {
    if (!cache) return false;
    return Date.now() - cache.timestamp < CACHE_TTL_MS;
  }

  /**
   * Invalidate the organization usage cache
   * Call this when organizations are updated to ensure fresh data
   */
  invalidateOrganizationUsageCache(): void {
    this.organizationUsageCache = null;
  }

  async getDashboardMetrics(forceRefresh = false): Promise<DashboardMetrics> {
    // Check cache first
    if (!forceRefresh && this.isCacheValid(this.dashboardMetricsCache)) {
      return this.dashboardMetricsCache!.data;
    }

    // Split into batches to reduce concurrent connections (8 queries -> 3 batches)
    const [totalOrganizations, activeOrganizations, totalUsers] =
      await Promise.all([
        this.organizationsRepository.count(),
        this.organizationsRepository.count({
          where: { status: OrganizationStatus.ACTIVE },
        }),
        this.usersRepository.count({
          where: { isDeleted: false },
        }),
      ]);
    const [totalExpensesProcessed, totalAccruals, pendingAccruals] =
      await Promise.all([
        this.expensesRepository.count({
          where: {
            isDeleted: false,
          },
        }),
        this.accrualsRepository.count({
          where: { isDeleted: false },
        }),
        this.accrualsRepository.count({
          where: {
            status: AccrualStatus.PENDING_SETTLEMENT,
            isDeleted: false,
          },
        }),
      ]);
    const [attachmentsSum, latestAuditLogs] = await Promise.all([
      this.getTotalAttachmentSize(),
      this.getLatestAuditLogs(10),
    ]);

    const inactiveOrganizations = totalOrganizations - activeOrganizations;

    const metrics: DashboardMetrics = {
      totalOrganizations,
      activeOrganizations,
      inactiveOrganizations,
      totalUsers,
      totalExpensesProcessed,
      totalAccruals,
      pendingAccruals,
      storageUsedMb: attachmentsSum,
      latestAuditLogs: latestAuditLogs.map((log) => ({
        id: log.id,
        organizationId: log.organization?.id ?? 'global',
        entityType: log.entityType,
        action: log.action,
        timestamp: log.timestamp.toISOString(),
      })),
    };

    // Cache the result
    this.dashboardMetricsCache = {
      data: metrics,
      timestamp: Date.now(),
    };

    return metrics;
  }

  async getOrganizationUsage(
    forceRefresh = false,
  ): Promise<OrganizationUsageItem[]> {
    // Check cache first
    if (!forceRefresh && this.isCacheValid(this.organizationUsageCache)) {
      return this.organizationUsageCache!.data;
    }

    const organizations = await this.organizationsRepository.find({
      order: { createdAt: 'DESC' },
    });

    // Process organizations in batches to avoid connection pool exhaustion
    // If we have many organizations, processing all at once can create
    // (number of organizations × 5 queries) concurrent connections
    const BATCH_SIZE = 5; // Process 5 organizations at a time
    const usage: OrganizationUsageItem[] = [];

    for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
      const batch = organizations.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (organization) => {
          // Split organization queries into smaller batches (5 queries -> 2 batches)
          const [userCount, expenseCount] = await Promise.all([
            this.usersRepository.count({
              where: {
                organization: { id: organization.id },
                isDeleted: false,
              },
            }),
            this.expensesRepository.count({
              where: {
                organization: { id: organization.id },
                isDeleted: false,
              },
            }),
          ]);
          const [accrualCount, storageMb] = await Promise.all([
            this.accrualsRepository.count({
              where: {
                organization: { id: organization.id },
                isDeleted: false,
              },
            }),
            this.getTotalAttachmentSize(organization.id),
          ]);
          // License query runs separately to avoid overloading
          const license = await this.licenseKeysService.findByOrganizationId(
            organization.id,
          );

          // Calculate ranking score: weighted combination of metrics
          // Formula: (expenseCount * 0.5) + (userCount * 0.3) + (accrualCount * 0.2)
          const rankingScore =
            expenseCount * 0.5 + userCount * 0.3 + accrualCount * 0.2;

          return {
            id: organization.id,
            name: organization.name,
            planType: organization.planType,
            status: organization.status,
            userCount,
            expenseCount,
            accrualCount,
            storageUsedMb: storageMb,
            rankingScore,
            createdAt: organization.createdAt,
            licenseExpiresAt: license?.expiresAt ?? null,
            enablePayroll: organization.enablePayroll,
            enableInventory: organization.enableInventory,
            enableBulkJournalImport: organization.enableBulkJournalImport,
          };
        }),
      );
      usage.push(...batchResults);
    }

    // Cache the result
    this.organizationUsageCache = {
      data: usage,
      timestamp: Date.now(),
    };

    return usage;
  }

  async getLatestAuditLogs(
    limit: number = 10,
    skip: number = 0,
  ): Promise<AuditLog[]> {
    return this.auditLogsRepository.find({
      take: limit,
      skip,
      order: { timestamp: 'DESC' },
      relations: ['organization'],
      where: { isDeleted: false },
    });
  }

  private async getTotalAttachmentSize(
    organizationId?: string,
  ): Promise<number> {
    const query = this.attachmentsRepository
      .createQueryBuilder('attachment')
      .select('COALESCE(SUM(attachment.file_size), 0)', 'total')
      .andWhere('attachment.is_deleted = false');

    if (organizationId) {
      query.where('attachment.organization_id = :organizationId', {
        organizationId,
      });
    }

    const result = await query.getRawOne<{ total: string }>();
    const totalBytes = Number(result?.total ?? 0);
    // Convert bytes to MB: divide by 1024×1024
    return Number((totalBytes / (1024 * 1024)).toFixed(2));
  }

  async deleteAllOrganizationData(organizationId: string): Promise<void> {
    // Verify organization exists
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Use transaction to ensure all-or-nothing deletion
    await this.dataSource.transaction(async (manager) => {
      // Delete in order to respect foreign key constraints
      // 1. Delete child records first (payments, allocations, line items)
      await manager
        .createQueryBuilder()
        .delete()
        .from(PaymentAllocation, 'pa')
        .where(
          'pa.payment_id IN (SELECT id FROM expense_payments WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(ExpensePayment, 'ep')
        .where('ep.organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(InvoicePayment, 'ip')
        .where('ip.organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(CreditNoteApplication, 'cna')
        .where(
          'cna.credit_note_id IN (SELECT id FROM credit_notes WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(DebitNoteApplication, 'dna')
        .where(
          'dna.debit_note_id IN (SELECT id FROM debit_notes WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(InvoiceLineItem, 'ili')
        .where(
          'ili.invoice_id IN (SELECT id FROM sales_invoices WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(PurchaseLineItem, 'pli')
        .where(
          'pli.expense_id IN (SELECT id FROM expenses WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(StockAdjustmentItem, 'sai')
        .where(
          'sai.adjustment_id IN (SELECT id FROM stock_adjustments WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(StockAdjustment, 'sa')
        .where('sa.organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(StockMovement, 'sm')
        .where('sm.organization_id = :orgId', { orgId: organizationId })
        .execute();

      // Delete payroll details first (cascade from entries)
      await manager
        .createQueryBuilder()
        .delete()
        .from(PayrollEntryDetail, 'ped')
        .where(
          'ped.payroll_entry_id IN (SELECT id FROM payroll_entries WHERE payroll_run_id IN (SELECT id FROM payroll_runs WHERE organization_id = :orgId))',
          { orgId: organizationId },
        )
        .execute();

      // Delete payroll entries (cascade from runs)
      await manager
        .createQueryBuilder()
        .delete()
        .from(PayrollEntry, 'pe')
        .where(
          'pe.payroll_run_id IN (SELECT id FROM payroll_runs WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      // Delete payroll runs
      await manager
        .createQueryBuilder()
        .delete()
        .from(PayrollRun, 'pr')
        .where('pr.organization_id = :orgId', { orgId: organizationId })
        .execute();

      // Delete salary components (cascade from profiles)
      await manager
        .createQueryBuilder()
        .delete()
        .from(SalaryComponent, 'sc')
        .where(
          'sc.salary_profile_id IN (SELECT id FROM employee_salary_profiles WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      // Delete employee salary profiles
      await manager
        .createQueryBuilder()
        .delete()
        .from(EmployeeSalaryProfile, 'esp')
        .where('esp.organization_id = :orgId', { orgId: organizationId })
        .execute();

      // Delete bank and system transactions first (they reference reconciliation records)
      await manager
        .createQueryBuilder()
        .delete()
        .from(BankTransaction, 'bt')
        .where('bt.organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(SystemTransaction, 'st')
        .where('st.organization_id = :orgId', { orgId: organizationId })
        .execute();

      // Delete reconciliation records (after transactions that reference them)
      await manager
        .createQueryBuilder()
        .delete()
        .from(ReconciliationRecord, 'rr')
        .where('rr.organization_id = :orgId', { orgId: organizationId })
        .execute();

      // 2. Delete main transaction records
      await manager
        .createQueryBuilder()
        .delete()
        .from(Expense, 'e')
        .where('e.organization_id = :orgId', { orgId: organizationId })
        .execute();

      // Delete credit notes BEFORE sales_invoices (credit_notes.invoice_id references sales_invoices)
      await manager
        .createQueryBuilder()
        .delete()
        .from(CreditNote, 'cn')
        .where('cn.organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(SalesInvoice, 'si')
        .where('si.organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(DebitNote, 'dn')
        .where('dn.organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(JournalEntry, 'je')
        .where('je.organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(Accrual, 'a')
        .where('a.organization_id = :orgId', { orgId: organizationId })
        .execute();

      // 3. Delete inventory-related
      await manager
        .createQueryBuilder()
        .delete()
        .from(Product, 'p')
        .where('p.organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(InventoryLocation, 'il')
        .where('il.organization_id = :orgId', { orgId: organizationId })
        .execute();

      // 4. Delete master data (purchase_orders reference vendors, so delete POs first)
      await manager
        .createQueryBuilder()
        .delete()
        .from(PurchaseOrderLineItem, 'poli')
        .where(
          'poli.purchase_order_id IN (SELECT id FROM purchase_orders WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(PurchaseOrder, 'po')
        .where('po.organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(Vendor, 'v')
        .where('v.organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(Customer, 'c')
        .where('c.organization_id = :orgId', { orgId: organizationId })
        .execute();

      // Delete junction table first (references both Category and TaxRule)
      await manager
        .createQueryBuilder()
        .delete()
        .from(CategoryTaxRule, 'ctr')
        .where(
          'ctr.tax_rule_id IN (SELECT id FROM tax_rules WHERE organization_id = :orgId) OR ctr.category_id IN (SELECT id FROM categories WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(Category, 'cat')
        .where('cat.organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(ExpenseType, 'et')
        .where('et.organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(TaxRate, 'tr')
        .where('tr.organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(TaxRule, 'trule')
        .where('trule.organization_id = :orgId', { orgId: organizationId })
        .execute();

      // 5. Delete settings and configuration
      await manager
        .createQueryBuilder()
        .delete()
        .from(OrganizationSettings, 'os')
        .where('os.organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(NumberingSequence, 'ns')
        .where('ns.organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(ExchangeRate, 'er')
        .where('er.organization_id = :orgId', { orgId: organizationId })
        .execute();

      // Delete email templates
      await manager
        .createQueryBuilder()
        .delete()
        .from(EmailTemplate, 'et')
        .where('et.organization_id = :orgId', { orgId: organizationId })
        .execute();

      // 6. Delete reports and logs
      await manager
        .createQueryBuilder()
        .delete()
        .from(Report, 'r')
        .where('r.organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(AuditLog, 'al')
        .where('al.organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(Notification, 'n')
        .where('n.organization_id = :orgId', { orgId: organizationId })
        .execute();

      // 7. Delete attachments
      await manager
        .createQueryBuilder()
        .delete()
        .from(Attachment, 'att')
        .where('att.organization_id = :orgId', { orgId: organizationId })
        .execute();

      // 8. Delete users (but keep organization)
      await manager
        .createQueryBuilder()
        .delete()
        .from(User, 'u')
        .where('u.organization_id = :orgId', { orgId: organizationId })
        .execute();

      // 9. Clear license key references (don't delete license keys, just clear organization reference)
      await manager
        .createQueryBuilder()
        .update(LicenseKey)
        .set({ consumedByOrganizationId: null, consumedByUserId: null })
        .where('consumedByOrganizationId = :orgId', { orgId: organizationId })
        .execute();

      // Note: Organization itself is NOT deleted, only its data
      // If you want to delete the organization too, uncomment:
      // await manager.delete(Organization, { id: organizationId });
    });
  }

  async clearOrganizationDataKeepUsers(organizationId: string): Promise<void> {
    // Verify organization exists
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Use transaction to ensure all-or-nothing deletion
    await this.dataSource.transaction(async (manager) => {
      // Delete in order to respect foreign key constraints
      // Same deletion order as deleteAllOrganizationData, but SKIP user deletion

      // 1. Delete child records first (payments, allocations, line items)
      await manager
        .createQueryBuilder()
        .delete()
        .from(PaymentAllocation)
        .where(
          'payment_id IN (SELECT id FROM expense_payments WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(ExpensePayment)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(InvoicePayment)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(CreditNoteApplication)
        .where(
          'credit_note_id IN (SELECT id FROM credit_notes WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(DebitNoteApplication)
        .where(
          'debit_note_id IN (SELECT id FROM debit_notes WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(InvoiceLineItem)
        .where(
          'invoice_id IN (SELECT id FROM sales_invoices WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(PurchaseLineItem)
        .where(
          'expense_id IN (SELECT id FROM expenses WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(StockAdjustmentItem)
        .where(
          'adjustment_id IN (SELECT id FROM stock_adjustments WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(StockAdjustment)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(StockMovement)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      // Delete payroll details first (cascade from entries)
      await manager
        .createQueryBuilder()
        .delete()
        .from(PayrollEntryDetail)
        .where(
          'payroll_entry_id IN (SELECT id FROM payroll_entries WHERE payroll_run_id IN (SELECT id FROM payroll_runs WHERE organization_id = :orgId))',
          { orgId: organizationId },
        )
        .execute();

      // Delete payroll entries (cascade from runs)
      await manager
        .createQueryBuilder()
        .delete()
        .from(PayrollEntry)
        .where(
          'payroll_run_id IN (SELECT id FROM payroll_runs WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      // Delete payroll runs
      await manager
        .createQueryBuilder()
        .delete()
        .from(PayrollRun)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      // Delete salary components (cascade from profiles)
      await manager
        .createQueryBuilder()
        .delete()
        .from(SalaryComponent)
        .where(
          'salary_profile_id IN (SELECT id FROM employee_salary_profiles WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      // Delete employee salary profiles
      await manager
        .createQueryBuilder()
        .delete()
        .from(EmployeeSalaryProfile)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      // Delete bank and system transactions first (they reference reconciliation records)
      await manager
        .createQueryBuilder()
        .delete()
        .from(BankTransaction)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(SystemTransaction)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      // Delete reconciliation records (after transactions that reference them)
      await manager
        .createQueryBuilder()
        .delete()
        .from(ReconciliationRecord)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      // 2. Delete main transaction records
      // Delete accruals FIRST (they reference expenses via foreign key)
      await manager
        .createQueryBuilder()
        .delete()
        .from(Accrual)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      // Now delete expenses (accruals are already deleted)
      await manager
        .createQueryBuilder()
        .delete()
        .from(Expense)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      // Delete credit notes BEFORE sales_invoices (credit_notes.invoice_id references sales_invoices)
      await manager
        .createQueryBuilder()
        .delete()
        .from(CreditNote)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(SalesInvoice)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(DebitNote)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(JournalEntry)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      // 3. Delete inventory-related
      await manager
        .createQueryBuilder()
        .delete()
        .from(Product)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(InventoryLocation)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      // 4. Delete master data (purchase_orders reference vendors, so delete POs first)
      await manager
        .createQueryBuilder()
        .delete()
        .from(PurchaseOrderLineItem)
        .where(
          'purchase_order_id IN (SELECT id FROM purchase_orders WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(PurchaseOrder)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(Vendor)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(Customer)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      // Delete junction table first (references both Category and TaxRule)
      await manager
        .createQueryBuilder()
        .delete()
        .from(CategoryTaxRule)
        .where(
          'tax_rule_id IN (SELECT id FROM tax_rules WHERE organization_id = :orgId) OR category_id IN (SELECT id FROM categories WHERE organization_id = :orgId)',
          { orgId: organizationId },
        )
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(Category)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(ExpenseType)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(TaxRate)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(TaxRule)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      // 5. Delete settings and configuration
      await manager
        .createQueryBuilder()
        .delete()
        .from(OrganizationSettings)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(NumberingSequence)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(ExchangeRate)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      // Delete email templates
      await manager
        .createQueryBuilder()
        .delete()
        .from(EmailTemplate)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      // 6. Delete reports and logs
      await manager
        .createQueryBuilder()
        .delete()
        .from(Report)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(AuditLog)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(Notification)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      // 7. Delete attachments
      await manager
        .createQueryBuilder()
        .delete()
        .from(Attachment)
        .where('organization_id = :orgId', { orgId: organizationId })
        .execute();

      // NOTE: Users are NOT deleted - they can still login
      // Users will see empty organization when they login

      // 8. Clear license key references (don't delete license keys, just clear organization reference)
      await manager
        .createQueryBuilder()
        .update(LicenseKey)
        .set({ consumedByOrganizationId: null, consumedByUserId: null })
        .where('consumedByOrganizationId = :orgId', { orgId: organizationId })
        .execute();
    });

    // After deletion, recreate default categories to make it feel like fresh start
    await this.categoriesService.ensureDefaultsForOrganization(organizationId);
  }
}
