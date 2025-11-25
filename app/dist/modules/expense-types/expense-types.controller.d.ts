import { ExpenseTypesService } from './expense-types.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateExpenseTypeDto } from './dto/create-expense-type.dto';
import { UpdateExpenseTypeDto } from './dto/update-expense-type.dto';
export declare class ExpenseTypesController {
    private readonly expenseTypesService;
    constructor(expenseTypesService: ExpenseTypesService);
    list(user: AuthenticatedUser): Promise<import("../../entities/expense-type.entity").ExpenseType[]>;
    create(user: AuthenticatedUser, dto: CreateExpenseTypeDto): Promise<import("../../entities/expense-type.entity").ExpenseType>;
    update(id: string, user: AuthenticatedUser, dto: UpdateExpenseTypeDto): Promise<import("../../entities/expense-type.entity").ExpenseType>;
    remove(id: string, user: AuthenticatedUser): Promise<{
        success: boolean;
    }>;
}
