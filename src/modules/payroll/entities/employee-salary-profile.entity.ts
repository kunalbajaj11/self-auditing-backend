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
import { SalaryComponent } from './salary-component.entity';

@Entity({ name: 'employee_salary_profiles' })
@Index(['organization', 'user', 'isDeleted'])
export class EmployeeSalaryProfile extends AbstractEntity {
  @ManyToOne(() => Organization, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User, {
    nullable: true,
  })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ name: 'employee_name', length: 255, nullable: true })
  employeeName?: string | null; // For employees without portal access

  @Column({ name: 'email', length: 255, nullable: true })
  email?: string | null; // Email address for sending payslips

  @Column({
    name: 'basic_salary',
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  basicSalary: string;

  @Column({ length: 10, default: 'AED' })
  currency: string;

  @Column({ name: 'effective_date', type: 'date' })
  effectiveDate: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate?: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => SalaryComponent, (component) => component.salaryProfile, {
    cascade: true,
  })
  salaryComponents: SalaryComponent[];
}
