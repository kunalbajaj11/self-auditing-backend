import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Expense } from './expense.entity';
import { Organization } from './organization.entity';
import { PaymentMethod } from '../common/enums/payment-method.enum';

@Entity({ name: 'expense_payments' })
@Index(['expense'])
@Index(['organization', 'paymentDate'])
export class ExpensePayment extends AbstractEntity {
  @ManyToOne(() => Expense, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'expense_id' })
  expense: Expense;

  @ManyToOne(() => Organization, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  amount: string;

  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: PaymentMethod,
    nullable: true,
  })
  paymentMethod?: PaymentMethod | null;

  @Column({ name: 'reference_number', length: 100, nullable: true })
  referenceNumber?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;
}
