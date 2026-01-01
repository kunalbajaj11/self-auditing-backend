import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  Index,
  Unique,
  OneToMany,
} from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { SalesInvoice } from './sales-invoice.entity';
import { Customer } from '../modules/customers/customer.entity';
import { DebitNoteStatus } from '../common/enums/debit-note-status.enum';
import { DebitNoteReason } from '../common/enums/debit-note-reason.enum';
import { DebitNoteApplication } from './debit-note-application.entity';

@Entity({ name: 'debit_notes' })
@Unique(['organization', 'debitNoteNumber'])
@Index(['organization', 'debitNoteDate'])
@Index(['organization', 'status'])
@Index(['customer'])
@Index(['invoice'])
export class DebitNote extends AbstractEntity {
  @ManyToOne(() => Organization, (organization) => organization.debitNotes, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User, (user) => user.debitNotes, {
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'debit_note_number', length: 100 })
  debitNoteNumber: string;

  @ManyToOne(() => SalesInvoice, {
    nullable: true,
  })
  @JoinColumn({ name: 'invoice_id' })
  invoice?: SalesInvoice | null;

  @ManyToOne(() => Customer, (customer) => customer.debitNotes, {
    nullable: true,
  })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer | null;

  @Column({ name: 'customer_name', length: 200, nullable: true })
  customerName?: string | null;

  @Column({ name: 'customer_trn', length: 50, nullable: true })
  customerTrn?: string | null;

  @Column({ name: 'debit_note_date', type: 'date' })
  debitNoteDate: string;

  @Column({
    type: 'enum',
    enum: DebitNoteReason,
  })
  reason: DebitNoteReason;

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
  exchangeRate?: string | null;

  @Column({
    name: 'base_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  baseAmount?: string | null;

  @Column({
    type: 'enum',
    enum: DebitNoteStatus,
    default: DebitNoteStatus.DRAFT,
  })
  status: DebitNoteStatus;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ name: 'applied_to_invoice', default: false })
  appliedToInvoice: boolean;

  @Column({
    name: 'applied_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  appliedAmount?: string | null;

  @OneToMany(() => DebitNoteApplication, (application) => application.debitNote)
  applications: DebitNoteApplication[];
}
