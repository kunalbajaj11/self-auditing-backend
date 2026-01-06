import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { Region } from '../common/enums/region.enum';

export enum ComplianceType {
  VAT_RETURN = 'vat_return',
  TDS_RETURN = 'tds_return',
  EPF_CHALLAN = 'epf_challan',
  ESI_CHALLAN = 'esi_challan',
  PROFESSIONAL_TAX = 'professional_tax',
  GSTR_1 = 'gstr_1',
  GSTR_3B = 'gstr_3b',
  ANNUAL_RETURN = 'annual_return',
}

export enum FilingFrequency {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUAL = 'annual',
  AD_HOC = 'ad_hoc',
}

export enum DeadlineStatus {
  PENDING = 'pending',
  UPCOMING = 'upcoming',
  DUE_TODAY = 'due_today',
  OVERDUE = 'overdue',
  FILED = 'filed',
  EXTENDED = 'extended',
}

@Entity({ name: 'compliance_deadlines' })
@Index(['organization', 'dueDate'])
@Index(['organization', 'status', 'dueDate'])
@Index(['organization', 'complianceType', 'period'])
export class ComplianceDeadline extends AbstractEntity {
  @ManyToOne(() => Organization, { nullable: false })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({
    name: 'compliance_type',
    type: 'enum',
    enum: ComplianceType,
  })
  complianceType: ComplianceType;

  @Column({ type: 'enum', enum: Region, nullable: true })
  region?: Region | null;

  @Column({ length: 20 })
  period: string; // Format: '2024-01' for monthly, '2024-Q1' for quarterly, '2024' for annual

  @Column({ name: 'due_date', type: 'date' })
  dueDate: Date;

  @Column({
    name: 'filing_frequency',
    type: 'enum',
    enum: FilingFrequency,
    default: FilingFrequency.MONTHLY,
  })
  filingFrequency: FilingFrequency;

  @Column({
    name: 'status',
    type: 'enum',
    enum: DeadlineStatus,
    default: DeadlineStatus.PENDING,
  })
  status: DeadlineStatus;

  @Column({ name: 'reminder_sent_30d', default: false })
  reminderSent30d: boolean; // Reminder sent 30 days before

  @Column({ name: 'reminder_sent_15d', default: false })
  reminderSent15d: boolean; // Reminder sent 15 days before

  @Column({ name: 'reminder_sent_7d', default: false })
  reminderSent7d: boolean; // Reminder sent 7 days before

  @Column({ name: 'reminder_sent_1d', default: false })
  reminderSent1d: boolean; // Reminder sent 1 day before

  @Column({ name: 'reminder_sent_due', default: false })
  reminderSentDue: boolean; // Reminder sent on due date

  @Column({ name: 'reminder_sent_overdue', default: false })
  reminderSentOverdue: boolean; // Reminder sent after due date

  @Column({ name: 'filed_at', type: 'timestamp', nullable: true })
  filedAt?: Date | null;

  @Column({ name: 'filing_reference', length: 200, nullable: true })
  filingReference?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ name: 'extended_due_date', type: 'date', nullable: true })
  extendedDueDate?: Date | null; // If deadline was extended
}

