import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { Category } from './category.entity';
import { ExpenseType as ExpenseTypeEnum } from '../common/enums/expense-type.enum';
import { Attachment } from './attachment.entity';
import { Accrual } from './accrual.entity';
import { ExpensePayment } from './expense-payment.entity';
import { ExpenseSource } from '../common/enums/expense-source.enum';
import { ExpenseType } from './expense-type.entity';
import { Vendor } from '../modules/vendors/vendor.entity';

@Entity({ name: 'expenses' })
export class Expense extends AbstractEntity {
  @ManyToOne(() => Organization, (organization) => organization.expenses, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User, (user) => user.expenses, {
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: ExpenseTypeEnum,
    nullable: true,
  })
  type?: ExpenseTypeEnum | null; // For system expense types (backward compatibility)

  @ManyToOne(() => ExpenseType, (expenseType) => expenseType.expenses, {
    nullable: true,
  })
  @JoinColumn({ name: 'expense_type_id' })
  expenseType?: ExpenseType | null; // For custom expense types

  @ManyToOne(() => Category, (category) => category.expenses, {
    nullable: true,
  })
  @JoinColumn({ name: 'category_id' })
  category?: Category | null;

  @ManyToOne(() => Vendor, (vendor) => vendor.expenses, { nullable: true })
  @JoinColumn({ name: 'vendor_id' })
  vendor?: Vendor | null;

  @Column({ name: 'vendor_name', length: 200, nullable: true })
  vendorName?: string | null; // Keep for backward compatibility

  @Column({ name: 'vendor_trn', length: 50, nullable: true })
  vendorTrn?: string | null; // Keep for backward compatibility

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @Column({
    name: 'vat_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  vatAmount: string;

  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    generatedType: 'STORED',
    asExpression: '"amount" + "vat_amount"',
  })
  totalAmount: string;

  @Column({ length: 10, default: 'AED' })
  currency: string;

  @Column({
    name: 'exchange_rate',
    type: 'decimal',
    precision: 12,
    scale: 6,
    nullable: true,
  })
  exchangeRate?: string | null; // Exchange rate used at time of expense

  @Column({
    name: 'base_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  baseAmount?: string | null; // Amount in organization's base currency

  @Column({
    name: 'fx_gain_loss',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  fxGainLoss?: string | null; // FX gain/loss if settled in different currency

  @Column({ name: 'expense_date', type: 'date' })
  expenseDate: string;

  @Column({ name: 'expected_payment_date', type: 'date', nullable: true })
  expectedPaymentDate?: string | null;

  @Column({ name: 'purchase_status', length: 50, nullable: true })
  purchaseStatus?: string | null; // 'Purchase - Cash Paid' or 'Purchase - Accruals'

  @ManyToOne(() => Expense, (expense) => expense.linkedExpenses, {
    nullable: true,
  })
  @JoinColumn({ name: 'linked_accrual_id' })
  linkedAccrual?: Expense | null;

  @OneToMany(() => Expense, (expense) => expense.linkedAccrual)
  linkedExpenses: Expense[];

  @Column({
    name: 'ocr_confidence',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  ocrConfidence?: string | null;

  @Column({
    type: 'enum',
    enum: ExpenseSource,
    default: ExpenseSource.MANUAL,
  })
  source: ExpenseSource;

  @OneToMany(() => Attachment, (attachment) => attachment.expense, {
    cascade: true,
  })
  attachments: Attachment[];

  @OneToOne(() => Accrual, (accrual) => accrual.expense, {
    cascade: true,
  })
  accrualDetail?: Accrual | null;

  @OneToMany(() => ExpensePayment, (payment) => payment.expense)
  payments: ExpensePayment[];
}
