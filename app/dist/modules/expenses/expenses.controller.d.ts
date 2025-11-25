import { ExpensesService } from './expenses.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseFilterDto } from './dto/expense-filter.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { UpdateExpenseStatusDto } from './dto/update-status.dto';
import { LinkAccrualDto } from './dto/link-accrual.dto';
export declare class ExpensesController {
    private readonly expensesService;
    constructor(expensesService: ExpensesService);
    list(user: AuthenticatedUser, filters: ExpenseFilterDto): Promise<import("../../entities/expense.entity").Expense[]>;
    get(id: string, user: AuthenticatedUser): Promise<import("../../entities/expense.entity").Expense>;
    create(user: AuthenticatedUser, dto: CreateExpenseDto): Promise<import("../../entities/expense.entity").Expense>;
    checkDuplicates(user: AuthenticatedUser, dto: CreateExpenseDto): Promise<{
        duplicates: any[];
        hasDuplicates: boolean;
    }>;
    update(id: string, user: AuthenticatedUser, dto: UpdateExpenseDto): Promise<import("../../entities/expense.entity").Expense>;
    updateStatus(id: string, user: AuthenticatedUser, dto: UpdateExpenseStatusDto): Promise<import("../../entities/expense.entity").Expense>;
    linkAccrual(id: string, user: AuthenticatedUser, dto: LinkAccrualDto): Promise<import("../../entities/expense.entity").Expense>;
}
