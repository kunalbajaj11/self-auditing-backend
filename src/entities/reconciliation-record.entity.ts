import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Index,
} from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { BankTransaction } from './bank-transaction.entity';
import { SystemTransaction } from './system-transaction.entity';

@Entity({ name: 'reconciliation_records' })
@Index('idx_reconciliation_records_org_date', ['organization', 'reconciliationDate'])
export class ReconciliationRecord extends AbstractEntity {
  @ManyToOne(() => Organization, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'reconciliation_date', type: 'date' })
  reconciliationDate: string;

  @Column({ name: 'statement_period_start', type: 'date' })
  statementPeriodStart: string;

  @Column({ name: 'statement_period_end', type: 'date' })
  statementPeriodEnd: string;

  @Column({ name: 'total_bank_credits', type: 'decimal', precision: 18, scale: 2, default: 0 })
  totalBankCredits: string;

  @Column({ name: 'total_bank_debits', type: 'decimal', precision: 18, scale: 2, default: 0 })
  totalBankDebits: string;

  @Column({ name: 'total_matched', type: 'int', default: 0 })
  totalMatched: number;

  @Column({ name: 'total_unmatched', type: 'int', default: 0 })
  totalUnmatched: number;

  @Column({ name: 'adjustments_count', type: 'int', default: 0 })
  adjustmentsCount: number;

  @Column({ name: 'closing_balance', type: 'decimal', precision: 18, scale: 2, nullable: true })
  closingBalance?: string | null;

  @Column({ name: 'system_closing_balance', type: 'decimal', precision: 18, scale: 2, nullable: true })
  systemClosingBalance?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User | null;

  @OneToMany(() => BankTransaction, (transaction) => transaction.reconciliationRecord)
  bankTransactions: BankTransaction[];

  @OneToMany(() => SystemTransaction, (transaction) => transaction.reconciliationRecord)
  systemTransactions: SystemTransaction[];
}

