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
import { CreditNoteStatus } from '../common/enums/credit-note-status.enum';
import { CreditNoteReason } from '../common/enums/credit-note-reason.enum';
import { CreditNoteApplication } from './credit-note-application.entity';

@Entity({ name: 'credit_notes' })
@Unique(['organization', 'creditNoteNumber'])
@Index(['organization', 'creditNoteDate'])
@Index(['organization', 'status'])
@Index(['customer'])
@Index(['invoice'])
export class CreditNote extends AbstractEntity {
  @ManyToOne(() => Organization, (organization) => organization.creditNotes, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User, (user) => user.creditNotes, {
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'credit_note_number', length: 100 })
  creditNoteNumber: string;

  @ManyToOne(() => SalesInvoice, {
    nullable: true,
  })
  @JoinColumn({ name: 'invoice_id' })
  invoice?: SalesInvoice | null;

  @ManyToOne(() => Customer, (customer) => customer.creditNotes, {
    nullable: true,
  })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer | null;

  @Column({ name: 'customer_name', length: 200, nullable: true })
  customerName?: string | null;

  @Column({ name: 'customer_trn', length: 50, nullable: true })
  customerTrn?: string | null;

  @Column({ name: 'credit_note_date', type: 'date' })
  creditNoteDate: string;

  @Column({
    type: 'enum',
    enum: CreditNoteReason,
  })
  reason: CreditNoteReason;

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
    enum: CreditNoteStatus,
    default: CreditNoteStatus.DRAFT,
  })
  status: CreditNoteStatus;

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

  @OneToMany(() => CreditNoteApplication, (application) => application.creditNote)
  applications: CreditNoteApplication[];
}

