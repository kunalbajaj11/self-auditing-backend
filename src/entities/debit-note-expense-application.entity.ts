import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { DebitNote } from './debit-note.entity';
import { Expense } from './expense.entity';
import { Organization } from './organization.entity';

/**
 * Tracks debit note applications to expenses
 * This ensures debit notes reduce the effective expense amount
 * without affecting the paidAmount (which should only reflect actual payments)
 * Outstanding balance = expense.total_amount - expensePayments - debitNoteApplications
 */
@Entity({ name: 'debit_note_expense_applications' })
@Index(['debitNote'])
@Index(['expense'])
@Index(['organization'])
export class DebitNoteExpenseApplication extends AbstractEntity {
  @ManyToOne(() => DebitNote, {
    nullable: false,
  })
  @JoinColumn({ name: 'debit_note_id' })
  debitNote: DebitNote;

  @ManyToOne(() => Expense, {
    nullable: false,
  })
  @JoinColumn({ name: 'expense_id' })
  expense: Expense;

  @ManyToOne(() => Organization, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  appliedAmount: string; // Amount of debit note applied to this expense

  @Column({ name: 'applied_date', type: 'date' })
  appliedDate: string;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;
}

