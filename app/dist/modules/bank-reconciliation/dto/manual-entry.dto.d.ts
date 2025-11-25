import { TransactionType } from '../../../common/enums/transaction-type.enum';
export declare class ManualEntryDto {
    transactionDate: string;
    description: string;
    amount: number;
    type: TransactionType;
    categoryId?: string;
    notes?: string;
}
