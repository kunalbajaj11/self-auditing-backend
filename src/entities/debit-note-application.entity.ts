import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { DebitNote } from './debit-note.entity';
import { SalesInvoice } from './sales-invoice.entity';
import { Organization } from './organization.entity';

/**
 * Tracks debit note applications to invoices
 * This ensures debit notes increase the effective invoice amount
 * without affecting the paidAmount (which should only reflect actual payments)
 */
@Entity({ name: 'debit_note_applications' })
@Index(['debitNote'])
@Index(['invoice'])
@Index(['organization'])
export class DebitNoteApplication extends AbstractEntity {
  @ManyToOne(() => DebitNote, {
    nullable: false,
  })
  @JoinColumn({ name: 'debit_note_id' })
  debitNote: DebitNote;

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
  appliedAmount: string; // Amount of debit note applied to this invoice

  @Column({ name: 'applied_date', type: 'date' })
  appliedDate: string;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;
}
