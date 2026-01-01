import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../../../entities/abstract.entity';
import { EmployeeSalaryProfile } from './employee-salary-profile.entity';
import { SalaryComponentType } from '../../../common/enums/salary-component-type.enum';
import { ComponentCalculationType } from '../../../common/enums/component-calculation-type.enum';

@Entity({ name: 'salary_components' })
export class SalaryComponent extends AbstractEntity {
  @ManyToOne(
    () => EmployeeSalaryProfile,
    (profile) => profile.salaryComponents,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'salary_profile_id' })
  salaryProfile: EmployeeSalaryProfile;

  @Column({
    name: 'component_type',
    type: 'enum',
    enum: SalaryComponentType,
  })
  componentType: SalaryComponentType;

  @Column({ length: 100 })
  name: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  amount?: string | null; // Fixed amount

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  percentage?: string | null; // Percentage of base

  @Column({
    name: 'hourly_rate',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  hourlyRate?: string | null; // For overtime

  @Column({
    name: 'calculation_type',
    type: 'enum',
    enum: ComponentCalculationType,
  })
  calculationType: ComponentCalculationType;

  @Column({ name: 'is_taxable', default: true })
  isTaxable: boolean;

  @Column({ type: 'int', default: 0 })
  priority: number; // Order of calculation
}
