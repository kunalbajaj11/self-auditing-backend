import { Repository } from 'typeorm';
import { ExpenseType } from '../../entities/expense-type.entity';
import { Organization } from '../../entities/organization.entity';
import { CreateExpenseTypeDto } from './dto/create-expense-type.dto';
import { UpdateExpenseTypeDto } from './dto/update-expense-type.dto';
import { User } from '../../entities/user.entity';
import { Expense } from '../../entities/expense.entity';
export declare class ExpenseTypesService {
    private readonly expenseTypesRepository;
    private readonly organizationsRepository;
    private readonly usersRepository;
    private readonly expensesRepository;
    constructor(expenseTypesRepository: Repository<ExpenseType>, organizationsRepository: Repository<Organization>, usersRepository: Repository<User>, expensesRepository: Repository<Expense>);
    ensureDefaultsForOrganization(organizationId: string): Promise<void>;
    findAllByOrganization(organizationId: string): Promise<ExpenseType[]>;
    create(organizationId: string, createdById: string, dto: CreateExpenseTypeDto): Promise<ExpenseType>;
    update(expenseTypeId: string, organizationId: string, dto: UpdateExpenseTypeDto): Promise<ExpenseType>;
    remove(expenseTypeId: string, organizationId: string): Promise<void>;
}
