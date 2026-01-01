import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../../../entities/abstract.entity';
import { PayrollEntry } from './payroll-entry.entity';
import { SalaryComponentType } from '../../../common/enums/salary-component-type.enum';

@Entity({ name: 'payroll_entry_details' })
export class PayrollEntryDetail extends AbstractEntity {
  @ManyToOne(() => PayrollEntry, (entry) => entry.entryDetails, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'payroll_entry_id' })
  payrollEntry: PayrollEntry;

  @Column({
    name: 'component_type',
    type: 'enum',
    enum: SalaryComponentType,
  })
  componentType: SalaryComponentType;

  @Column({ name: 'component_name', length: 100 })
  componentName: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  amount: string;

  @Column({ name: 'is_taxable', default: true })
  isTaxable: boolean;
}
