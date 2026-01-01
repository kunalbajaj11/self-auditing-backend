import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { ExpensePayment } from './expense-payment.entity';
import { Expense } from './expense.entity';

@Entity({ name: 'payment_allocations' })
@Index(['payment'])
@Index(['expense'])
@Index(['payment', 'expense'], { unique: true }) // Prevent duplicate allocations
export class PaymentAllocation extends AbstractEntity {
  @ManyToOne(() => ExpensePayment, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'payment_id' })
  payment: ExpensePayment;

  @ManyToOne(() => Expense, {
    nullable: false,
  })
  @JoinColumn({ name: 'expense_id' })
  expense: Expense;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  allocatedAmount: string; // Amount allocated to this specific expense/invoice
}
