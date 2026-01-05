import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Index,
} from 'typeorm';
import { AbstractEntity } from '../../../entities/abstract.entity';
import { PayrollRun } from './payroll-run.entity';
import { User } from '../../../entities/user.entity';
import { PayrollEntryDetail } from './payroll-entry-detail.entity';

@Entity({ name: 'payroll_entries' })
export class PayrollEntry extends AbstractEntity {
  @ManyToOne(() => PayrollRun, (run) => run.payrollEntries, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'payroll_run_id' })
  payrollRun: PayrollRun;

  @ManyToOne(() => User, {
    nullable: true, // Allow null for employees without portal access
  })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ name: 'employee_name', length: 255, nullable: true })
  employeeName?: string | null; // Employee name for external employees (without portal access)

  @Column({
    name: 'basic_salary',
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  basicSalary: string;

  @Column({
    name: 'allowances_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  allowancesAmount: string;

  @Column({
    name: 'deductions_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  deductionsAmount: string;

  @Column({
    name: 'overtime_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  overtimeAmount: string;

  @Column({
    name: 'bonus_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  bonusAmount: string;

  @Column({
    name: 'commission_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  commissionAmount: string;

  @Column({
    name: 'gross_salary',
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  grossSalary: string;

  @Column({
    name: 'net_salary',
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  netSalary: string;

  @Column({ length: 10, default: 'AED' })
  currency: string;

  @Column({ name: 'email', length: 255, nullable: true })
  email?: string | null; // Email from salary profile for sending payslips

  @Column({ name: 'payslip_generated', default: false })
  payslipGenerated: boolean;

  @Column({ name: 'payslip_attachment_id', type: 'uuid', nullable: true })
  payslipAttachmentId?: string | null;

  @Column({ name: 'payslip_email_sent', default: false })
  payslipEmailSent: boolean;

  @Column({
    name: 'payslip_email_sent_at',
    type: 'timestamp',
    nullable: true,
  })
  payslipEmailSentAt?: Date | null;

  @OneToMany(() => PayrollEntryDetail, (detail) => detail.payrollEntry, {
    cascade: true,
  })
  entryDetails: PayrollEntryDetail[];
}
