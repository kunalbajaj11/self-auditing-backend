import { ExpenseType } from '../../../common/enums/expense-type.enum';
import { ExpenseStatus } from '../../../common/enums/expense-status.enum';
export declare class ExpenseFilterDto {
    startDate?: string;
    endDate?: string;
    categoryId?: string;
    status?: ExpenseStatus;
    type?: ExpenseType;
    vendorName?: string;
    createdBy?: string;
    currency?: string;
    vendorId?: string;
}
