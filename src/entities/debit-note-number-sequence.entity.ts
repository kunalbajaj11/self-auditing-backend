import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from './organization.entity';

/**
 * Tracks sequential debit note numbers per organization per year
 * Ensures thread-safe debit note number generation
 */
@Entity({ name: 'debit_note_number_sequences' })
export class DebitNoteNumberSequence {
  @PrimaryColumn({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @PrimaryColumn({ name: 'year', type: 'int' })
  year: number;

  @Column({ name: 'last_number', type: 'int', default: 0 })
  lastNumber: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;
}

