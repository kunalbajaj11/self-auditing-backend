import { ExpenseType } from '../../../common/enums/expense-type.enum';
import { ExpenseSource } from '../../../common/enums/expense-source.enum';
import { AttachmentInputDto } from './attachment-input.dto';
export declare class CreateExpenseDto {
    type: ExpenseType;
    categoryId?: string;
    amount: number;
    vatAmount?: number;
    expenseDate: string;
    expectedPaymentDate?: string;
    vendorId?: string;
    vendorName?: string;
    vendorTrn?: string;
    currency?: string;
    description?: string;
    source?: ExpenseSource;
    ocrConfidence?: number;
    linkedAccrualExpenseId?: string;
    attachments?: AttachmentInputDto[];
}
