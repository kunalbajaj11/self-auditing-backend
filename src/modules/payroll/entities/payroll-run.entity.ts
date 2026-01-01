import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Index,
} from 'typeorm';
import { AbstractEntity } from '../../../entities/abstract.entity';
import { Organization } from '../../../entities/organization.entity';
import { User } from '../../../entities/user.entity';
import { PayrollRunStatus } from '../../../common/enums/payroll-run-status.enum';
import { PayrollEntry } from './payroll-entry.entity';

@Entity({ name: 'payroll_runs' })
@Index(['organization', 'payrollPeriod', 'isDeleted'])
export class PayrollRun extends AbstractEntity {
  @ManyToOne(() => Organization, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User, {
    nullable: false,
  })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @Column({ name: 'payroll_period', length: 50 })
  payrollPeriod: string; // e.g., "2024-01"

  @Column({ name: 'pay_date', type: 'date' })
  payDate: string;

  @Column({
    type: 'enum',
    enum: PayrollRunStatus,
    default: PayrollRunStatus.DRAFT,
  })
  status: PayrollRunStatus;

  @Column({
    name: 'total_gross_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  totalGrossAmount: string;

  @Column({
    name: 'total_deductions',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  totalDeductions: string;

  @Column({
    name: 'total_net_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  totalNetAmount: string;

  @Column({ length: 10, default: 'AED' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @OneToMany(() => PayrollEntry, (entry) => entry.payrollRun, {
    cascade: true,
  })
  payrollEntries: PayrollEntry[];
}
