import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { JournalEntryAccount } from '../common/enums/journal-entry-account.enum';

@Entity({ name: 'journal_entries' })
export class JournalEntry extends AbstractEntity {
  @ManyToOne(() => Organization, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User, {
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: JournalEntryAccount,
    name: 'debit_account',
    nullable: true, // Temporarily nullable for migration
  })
  debitAccount?: JournalEntryAccount | null;

  @Column({
    type: 'enum',
    enum: JournalEntryAccount,
    name: 'credit_account',
    nullable: true, // Temporarily nullable for migration
  })
  creditAccount?: JournalEntryAccount | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @Column({ name: 'entry_date', type: 'date' })
  entryDate: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'reference_number', length: 100, nullable: true })
  referenceNumber?: string | null;

  @Column({ name: 'customer_vendor_id', length: 100, nullable: true })
  customerVendorId?: string | null;

  @Column({ name: 'customer_vendor_name', length: 200, nullable: true })
  customerVendorName?: string | null;

  @Column({ name: 'attachment_id', length: 100, nullable: true })
  attachmentId?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  // Legacy fields - kept for backward compatibility during migration
  // These will be removed after migration is complete
  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    name: 'legacy_type',
  })
  legacyType?: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    name: 'legacy_category',
  })
  legacyCategory?: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    name: 'legacy_status',
  })
  legacyStatus?: string | null;
}

