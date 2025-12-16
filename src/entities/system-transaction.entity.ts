import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { Expense } from './expense.entity';
import { ReconciliationRecord } from './reconciliation-record.entity';
import { ReconciliationStatus } from '../common/enums/reconciliation-status.enum';
import { TransactionType } from '../common/enums/transaction-type.enum';

@Entity({ name: 'system_transactions' })
@Index('idx_system_transactions_org_date', ['organization', 'transactionDate'])
@Index('idx_system_transactions_status', ['status'])
export class SystemTransaction extends AbstractEntity {
  @ManyToOne(() => Organization, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'transaction_date', type: 'date' })
  transactionDate: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @ManyToOne(() => Expense, {
    nullable: true,
  })
  @JoinColumn({ name: 'expense_id' })
  expense?: Expense | null;

  @Column({
    type: 'enum',
    enum: ReconciliationStatus,
    default: ReconciliationStatus.UNMATCHED,
  })
  status: ReconciliationStatus;

  @ManyToOne(
    () => ReconciliationRecord,
    (record) => record.systemTransactions,
    {
      nullable: true,
    },
  )
  @JoinColumn({ name: 'reconciliation_record_id' })
  reconciliationRecord?: ReconciliationRecord | null;

  @Column({ name: 'source', type: 'varchar', length: 50, default: 'expense' })
  source: string; // 'expense', 'credit', 'adjustment', 'reconciliation'
}
