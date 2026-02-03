import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  Unique,
} from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { SalesInvoice } from './sales-invoice.entity';

/**
 * Stores SHA-256 integrity hash for finalized (tax) invoices.
 * Used for: integrity proof, audit trail, future cryptographic stamp input.
 * Hash input: supplier_trn + invoice_number + invoice_date + total_amount + vat_amount
 */
@Entity({ name: 'invoice_hashes' })
@Unique(['invoice'])
export class InvoiceHash extends AbstractEntity {
  @OneToOne(() => SalesInvoice, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'invoice_id' })
  invoice: SalesInvoice;

  @Column({ name: 'hash', length: 64 })
  hash: string;

  @Column({ name: 'generated_at', type: 'timestamp' })
  generatedAt: Date;
}
