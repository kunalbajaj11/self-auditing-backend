import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { Expense } from './expense.entity';
import { Category } from './category.entity';
export declare class ExpenseType extends AbstractEntity {
    organization: Organization;
    name: string;
    description?: string | null;
    isSystemDefault: boolean;
    displayLabel?: string | null;
    createdBy?: User | null;
    expenses: Expense[];
    categories: Category[];
}
