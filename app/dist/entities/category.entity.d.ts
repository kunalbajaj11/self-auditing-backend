import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { Expense } from './expense.entity';
import { ExpenseType } from './expense-type.entity';
export declare class Category extends AbstractEntity {
    organization: Organization;
    name: string;
    description?: string | null;
    isSystemDefault: boolean;
    expenseType?: string | null;
    expenseTypeEntity?: ExpenseType | null;
    createdBy?: User | null;
    expenses: Expense[];
}
