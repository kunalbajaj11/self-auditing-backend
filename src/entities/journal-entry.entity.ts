import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { JournalEntryType } from '../common/enums/journal-entry-type.enum';
import { JournalEntryCategory } from '../common/enums/journal-entry-category.enum';
import { JournalEntryStatus } from '../common/enums/journal-entry-status.enum';

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
    enum: JournalEntryType,
    nullable: false,
  })
  type: JournalEntryType;

  @Column({
    type: 'enum',
    enum: JournalEntryCategory,
    nullable: false,
  })
  category: JournalEntryCategory;

  @Column({
    type: 'enum',
    enum: JournalEntryStatus,
    nullable: false,
  })
  status: JournalEntryStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @Column({ name: 'entry_date', type: 'date' })
  entryDate: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'reference_number', length: 100, nullable: true })
  referenceNumber?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;
}

