import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { ReportType } from '../common/enums/report-type.enum';
import { User } from './user.entity';

@Entity({ name: 'reports' })
export class Report extends AbstractEntity {
  @ManyToOne(() => Organization, (organization) => organization.reports, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'trial_balance',
  })
  type: ReportType;

  @Column({ type: 'jsonb', nullable: true })
  filters?: Record<string, any> | null;

  @Column({ name: 'file_url', type: 'text', nullable: true })
  fileUrl?: string | null;

  @ManyToOne(() => User, (user) => user.generatedReports, { nullable: true })
  @JoinColumn({ name: 'generated_by' })
  generatedBy?: User | null;
}
