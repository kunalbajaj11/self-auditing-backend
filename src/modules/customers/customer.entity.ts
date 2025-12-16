import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Index,
  Unique,
} from 'typeorm';
import { AbstractEntity } from '../../entities/abstract.entity';
import { Organization } from '../../entities/organization.entity';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { CreditNote } from '../../entities/credit-note.entity';
import { DebitNote } from '../../entities/debit-note.entity';

@Entity({ name: 'customers' })
@Unique(['organization', 'name'])
@Index(['organization', 'isDeleted'])
@Index(['name'])
export class Customer extends AbstractEntity {
  @ManyToOne(() => Organization, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ length: 200 })
  name: string;

  @Column({ name: 'display_name', length: 200, nullable: true })
  displayName?: string | null;

  @Column({ name: 'customer_trn', length: 50, nullable: true })
  customerTrn?: string | null;

  @Column({ type: 'text', nullable: true })
  address?: string | null;

  @Column({ length: 100, nullable: true })
  city?: string | null;

  @Column({ length: 50, nullable: true })
  country?: string | null;

  @Column({ length: 100, nullable: true })
  emirate?: string | null;

  @Column({ length: 20, nullable: true })
  phone?: string | null;

  @Column({ length: 100, nullable: true })
  email?: string | null;

  @Column({ name: 'contact_person', length: 100, nullable: true })
  contactPerson?: string | null;

  @Column({ name: 'preferred_currency', length: 10, default: 'AED' })
  preferredCurrency: string;

  @Column({ name: 'payment_terms', type: 'int', nullable: true })
  paymentTerms?: number | null; // Days

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ name: 'first_used_at', type: 'timestamp', nullable: true })
  firstUsedAt?: Date | null;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt?: Date | null;

  @OneToMany(() => SalesInvoice, (invoice) => invoice.customer)
  invoices: SalesInvoice[];

  @OneToMany(() => CreditNote, (creditNote) => creditNote.customer)
  creditNotes: CreditNote[];

  @OneToMany(() => DebitNote, (debitNote) => debitNote.customer)
  debitNotes: DebitNote[];
}
