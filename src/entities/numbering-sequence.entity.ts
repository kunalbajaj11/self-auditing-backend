import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';

export enum NumberingSequenceType {
  INVOICE = 'invoice',
  PROFORMA_INVOICE = 'proforma_invoice',
  QUOTE = 'quote',
  CREDIT_NOTE = 'credit_note',
  DEBIT_NOTE = 'debit_note',
  SALES_ORDER = 'sales_order',
  DELIVERY_CHALLAN = 'delivery_challan',
  PURCHASE_ORDER = 'purchase_order',
  PAYMENT_RECEIPT = 'payment_receipt',
  EXPENSE = 'expense',
}

export enum ResetPeriod {
  NEVER = 'never',
  YEARLY = 'yearly',
  QUARTERLY = 'quarterly',
  MONTHLY = 'monthly',
}

@Entity({ name: 'numbering_sequences' })
@Index(['organization', 'type'], { unique: true })
export class NumberingSequence extends AbstractEntity {
  @ManyToOne(() => Organization, { nullable: false })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({
    type: 'enum',
    enum: NumberingSequenceType,
  })
  type: NumberingSequenceType;

  @Column({ length: 50, default: '' })
  prefix: string;

  @Column({ length: 50, default: '' })
  suffix: string;

  @Column({ name: 'next_number', type: 'integer', default: 1 })
  nextNumber: number;

  @Column({ name: 'number_length', type: 'integer', default: 5 })
  numberLength: number;

  @Column({
    type: 'enum',
    enum: ResetPeriod,
    default: ResetPeriod.NEVER,
  })
  resetPeriod: ResetPeriod;

  @Column({ name: 'last_reset_date', type: 'date', nullable: true })
  lastResetDate?: string | null;

  @Column({ type: 'text', nullable: true })
  format?: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
