import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { PlanType } from '../common/enums/plan-type.enum';
import { LicenseKeyStatus } from '../common/enums/license-key-status.enum';
import { Region } from '../common/enums/region.enum';
import { User } from './user.entity';

@Entity({ name: 'license_keys' })
export class LicenseKey extends AbstractEntity {
  @Column({ unique: true })
  @Index()
  key: string;

  @Column({
    type: 'enum',
    enum: LicenseKeyStatus,
    default: LicenseKeyStatus.ACTIVE,
  })
  status: LicenseKeyStatus;

  @Column({
    type: 'enum',
    enum: PlanType,
    nullable: true,
  })
  planType?: PlanType | null;

  @Column({ type: 'integer', nullable: true })
  maxUsers?: number | null;

  @Column({ type: 'integer', nullable: true })
  storageQuotaMb?: number | null;

  @Column({ type: 'integer', default: 2000 })
  maxUploads: number;

  @Column({ type: 'integer', default: 0 })
  allocatedUploads: number;

  @Column({ type: 'timestamp with time zone' })
  expiresAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  consumedAt?: Date | null;

  @Column({ nullable: true })
  consumedByOrganizationId?: string | null;

  @Column({ nullable: true })
  consumedByUserId?: string | null;

  @Column({ nullable: true })
  notes?: string | null;

  @Column({ nullable: true })
  email?: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  region?: Region | null;

  @Column({ type: 'boolean', default: false })
  enablePayroll: boolean;

  @Column({ type: 'boolean', default: false })
  enableInventory: boolean;

  @Column({ name: 'enable_bulk_journal_import', type: 'boolean', default: false })
  enableBulkJournalImport: boolean;

  @ManyToOne(() => User, { nullable: true })
  createdBy?: User | null;

  @Column({ nullable: true })
  createdById?: string | null;
}
