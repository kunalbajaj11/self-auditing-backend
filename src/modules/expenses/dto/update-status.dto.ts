import { IsEnum } from 'class-validator';
import { ExpenseStatus } from '../../../common/enums/expense-status.enum';

export class UpdateExpenseStatusDto {
  @IsEnum(ExpenseStatus)
  status: ExpenseStatus;
}
