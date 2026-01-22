import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';

export enum OcrJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity({ name: 'ocr_jobs' })
export class OcrJob extends AbstractEntity {
  @ManyToOne(() => Organization, { nullable: false })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ name: 'user_id', nullable: true })
  userId?: string | null;

  @Column({ name: 'file_name', length: 255 })
  fileName: string;

  @Column({ name: 'file_key', type: 'text' })
  fileKey: string;

  @Column({ name: 'file_url', type: 'text' })
  fileUrl: string;

  @Column({ name: 'file_type', length: 50 })
  fileType: string;

  @Column({ name: 'file_size', type: 'int' })
  fileSize: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: OcrJobStatus,
    default: OcrJobStatus.PENDING,
  })
  status: OcrJobStatus;

  @Column({ name: 'job_id', type: 'varchar', length: 255, unique: true })
  jobId: string;

  @Column({ name: 'result', type: 'jsonb', nullable: true })
  result?: any;

  @Column({ name: 'error', type: 'text', nullable: true })
  error?: string | null;

  @Column({ name: 'progress', type: 'int', default: 0 })
  progress: number;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt?: Date | null;
}
