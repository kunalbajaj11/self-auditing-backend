import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { PlanType } from '../common/enums/plan-type.enum';
import { OrganizationStatus } from '../common/enums/organization-status.enum';
import { Region } from '../common/enums/region.enum';
import { User } from './user.entity';
import { Category } from './category.entity';
import { Expense } from './expense.entity';
import { Attachment } from './attachment.entity';
import { Accrual } from './accrual.entity';
import { Notification } from './notification.entity';
import { Report } from './report.entity';
import { AuditLog } from './audit-log.entity';
import { Plan } from './plan.entity';
import { ExpenseType } from './expense-type.entity';
import { ExchangeRate } from './exchange-rate.entity';
import { Vendor } from '../modules/vendors/vendor.entity';
import { SalesInvoice } from './sales-invoice.entity';
import { CreditNote } from './credit-note.entity';
import { DebitNote } from './debit-note.entity';
import { JournalEntry } from './journal-entry.entity';
import { LedgerAccount } from './ledger-account.entity';
import { PurchaseOrder } from './purchase-order.entity';

@Entity({ name: 'organizations' })
@Unique(['name'])
export class Organization extends AbstractEntity {
  @Column({ length: 150 })
  name: string;

  @Column({ name: 'vat_number', length: 50, nullable: true })
  vatNumber?: string | null;

  @Column({ type: 'text', nullable: true })
  address?: string | null;

  @Column({ length: 10, default: 'AED' })
  currency: string;

  @Column({ name: 'base_currency', length: 10, default: 'AED' })
  baseCurrency: string; // Base currency for all conversions

  @Column({
    name: 'plan_type',
    type: 'enum',
    enum: PlanType,
    default: PlanType.FREE,
  })
  planType: PlanType;

  @Column({
    type: 'enum',
    enum: OrganizationStatus,
    default: OrganizationStatus.ACTIVE,
  })
  status: OrganizationStatus;

  @Column({ name: 'contact_person', length: 100, nullable: true })
  contactPerson?: string | null;

  @Column({ name: 'contact_email', length: 100, nullable: true })
  contactEmail?: string | null;

  @Column({ length: 20, nullable: true })
  phone?: string | null;

  @Column({ length: 200, nullable: true })
  website?: string | null;

  @Column({ length: 100, nullable: true })
  emirate?: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    default: 'UAE',
  })
  region?: Region | null;

  @Column({ name: 'bank_account_holder', length: 200, nullable: true })
  bankAccountHolder?: string | null;

  @Column({ name: 'bank_name', length: 200, nullable: true })
  bankName?: string | null;

  @Column({ name: 'bank_account_number', length: 50, nullable: true })
  bankAccountNumber?: string | null;

  @Column({ name: 'bank_iban', length: 50, nullable: true })
  bankIban?: string | null;

  @Column({ name: 'bank_branch', length: 200, nullable: true })
  bankBranch?: string | null;

  @Column({ name: 'bank_swift_code', length: 20, nullable: true })
  bankSwiftCode?: string | null;

  @Column({ name: 'storage_quota_mb', type: 'int', nullable: true })
  storageQuotaMb?: number | null;

  @Column({ name: 'enable_payroll', type: 'boolean', default: false })
  enablePayroll: boolean;

  @Column({ name: 'enable_inventory', type: 'boolean', default: false })
  enableInventory: boolean;

  @ManyToOne(() => Plan, (plan) => plan.organizations, {
    nullable: true,
    eager: false,
  })
  @JoinColumn({ name: 'plan_id' })
  plan?: Plan | null;

  @OneToMany(() => User, (user) => user.organization)
  users: User[];

  @OneToMany(() => Category, (category) => category.organization)
  categories: Category[];

  @OneToMany(() => Expense, (expense) => expense.organization)
  expenses: Expense[];

  @OneToMany(() => ExpenseType, (expenseType) => expenseType.organization)
  expenseTypes: ExpenseType[];

  @OneToMany(() => Attachment, (attachment) => attachment.organization)
  attachments: Attachment[];

  @OneToMany(() => Accrual, (accrual) => accrual.organization)
  accruals: Accrual[];

  @OneToMany(() => Notification, (notification) => notification.organization)
  notifications: Notification[];

  @OneToMany(() => Report, (report) => report.organization)
  reports: Report[];

  @OneToMany(() => AuditLog, (auditLog) => auditLog.organization)
  auditLogs: AuditLog[];

  @OneToMany(() => ExchangeRate, (exchangeRate) => exchangeRate.organization)
  exchangeRates: ExchangeRate[];

  @OneToMany(() => Vendor, (vendor) => vendor.organization)
  vendors: Vendor[];

  @OneToMany(() => SalesInvoice, (invoice) => invoice.organization)
  salesInvoices: SalesInvoice[];

  @OneToMany(() => CreditNote, (creditNote) => creditNote.organization)
  creditNotes: CreditNote[];

  @OneToMany(() => DebitNote, (debitNote) => debitNote.organization)
  debitNotes: DebitNote[];

  @OneToMany(() => JournalEntry, (journalEntry) => journalEntry.organization)
  journalEntries: JournalEntry[];

  @OneToMany(() => LedgerAccount, (ledgerAccount) => ledgerAccount.organization)
  ledgerAccounts: LedgerAccount[];

  @OneToMany(() => PurchaseOrder, (po) => po.organization)
  purchaseOrders: PurchaseOrder[];
}
