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
import { ExpenseType } from './expense-type.entity';

@Entity({ name: 'categories' })
@Unique(['organization', 'name'])
export class Category extends AbstractEntity {
  @ManyToOne(() => Organization, (organization) => organization.categories, {
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

  @Column({ name: 'expense_type', length: 50, nullable: true })
  expenseType?: string | null; // For system expense types (backward compatibility)

  @ManyToOne(() => ExpenseType, (expenseType) => expenseType.categories, {
    nullable: true,
  })
  @JoinColumn({ name: 'expense_type_id' })
  expenseTypeEntity?: ExpenseType | null; // For custom expense types

  @ManyToOne(() => User, (user) => user.createdCategories, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User | null;

  @OneToMany(() => Expense, (expense) => expense.category)
  expenses: Expense[];
}

