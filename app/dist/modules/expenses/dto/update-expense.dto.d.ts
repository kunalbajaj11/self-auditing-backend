import { ExpenseType } from '../../../common/enums/expense-type.enum';
import { AttachmentInputDto } from './attachment-input.dto';
export declare class UpdateExpenseDto {
    type?: ExpenseType;
    categoryId?: string;
    amount?: number;
    vatAmount?: number;
    expenseDate?: string;
    expectedPaymentDate?: string;
    vendorName?: string;
    vendorTrn?: string;
    description?: string;
    attachments?: AttachmentInputDto[];
}
