import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { CreditNote } from './credit-note.entity';
import { SalesInvoice } from './sales-invoice.entity';
import { Organization } from './organization.entity';

/**
 * Tracks credit note applications to invoices
 * This ensures credit notes reduce the effective invoice amount
 * without affecting the paidAmount (which should only reflect actual payments)
 */
@Entity({ name: 'credit_note_applications' })
@Index(['creditNote'])
@Index(['invoice'])
@Index(['organization'])
export class CreditNoteApplication extends AbstractEntity {
  @ManyToOne(() => CreditNote, {
    nullable: false,
  })
  @JoinColumn({ name: 'credit_note_id' })
  creditNote: CreditNote;

  @ManyToOne(() => SalesInvoice, {
    nullable: false,
  })
  @JoinColumn({ name: 'invoice_id' })
  invoice: SalesInvoice;

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
  appliedAmount: string; // Amount of credit note applied to this invoice

  @Column({ name: 'applied_date', type: 'date' })
  appliedDate: string;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;
}

