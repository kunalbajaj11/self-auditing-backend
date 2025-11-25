import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { Expense } from './expense.entity';
import { Category } from './category.entity';

@Entity({ name: 'expense_types' })
@Unique(['organization', 'name'])
export class ExpenseType extends AbstractEntity {
  @ManyToOne(() => Organization, (organization) => organization.expenseTypes, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'is_system_default', default: false })
  isSystemDefault: boolean;

  @Column({ name: 'display_label', length: 100, nullable: true })
  displayLabel?: string | null; // For custom display names (e.g., "Sales" for "credit")

  @ManyToOne(() => User, (user) => user.createdExpenseTypes, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User | null;

  @OneToMany(() => Expense, (expense) => expense.expenseType)
  expenses: Expense[];

  @OneToMany(() => Category, (category) => category.expenseTypeEntity)
  categories: Category[];
}

