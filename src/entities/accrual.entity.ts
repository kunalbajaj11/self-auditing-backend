import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
} from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Expense } from './expense.entity';
import { Organization } from './organization.entity';
import { AccrualStatus } from '../common/enums/accrual-status.enum';

@Entity({ name: 'accruals' })
export class Accrual extends AbstractEntity {
  @OneToOne(() => Expense, (expense) => expense.accrualDetail, {
    nullable: false,
  })
  @JoinColumn({ name: 'expense_id' })
  expense: Expense;

  @ManyToOne(() => Organization, (organization) => organization.accruals, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'vendor_name', length: 200, nullable: true })
  vendorName?: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @Column({ name: 'expected_payment_date', type: 'date' })
  expectedPaymentDate: string;

  @Column({ name: 'settlement_date', type: 'date', nullable: true })
  settlementDate?: string | null;

  @ManyToOne(() => Expense, {
    nullable: true,
  })
  @JoinColumn({ name: 'settlement_expense_id' })
  settlementExpense?: Expense | null;

  @Column({
    type: 'enum',
    enum: AccrualStatus,
    default: AccrualStatus.PENDING_SETTLEMENT,
  })
  status: AccrualStatus;
}

