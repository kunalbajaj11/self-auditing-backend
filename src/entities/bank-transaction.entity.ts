import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { TransactionType } from '../common/enums/transaction-type.enum';
import { ReconciliationStatus } from '../common/enums/reconciliation-status.enum';
import { ReconciliationRecord } from './reconciliation-record.entity';

@Entity({ name: 'bank_transactions' })
@Index('idx_bank_transactions_org_date', ['organization', 'transactionDate'])
@Index('idx_bank_transactions_status', ['status'])
export class BankTransaction extends AbstractEntity {
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

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  balance?: string | null;

  @Column({ type: 'text', nullable: true })
  reference?: string | null;

  @Column({ name: 'source_file', type: 'text' })
  sourceFile: string;

  @Column({
    type: 'enum',
    enum: ReconciliationStatus,
    default: ReconciliationStatus.UNMATCHED,
  })
  status: ReconciliationStatus;

  @ManyToOne(() => ReconciliationRecord, (record) => record.bankTransactions, {
    nullable: true,
  })
  @JoinColumn({ name: 'reconciliation_record_id' })
  reconciliationRecord?: ReconciliationRecord | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'uploaded_by' })
  uploadedBy?: User | null;
}

