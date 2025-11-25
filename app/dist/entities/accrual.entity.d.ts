import { AbstractEntity } from './abstract.entity';
import { Expense } from './expense.entity';
import { Organization } from './organization.entity';
import { AccrualStatus } from '../common/enums/accrual-status.enum';
export declare class Accrual extends AbstractEntity {
    expense: Expense;
    organization: Organization;
    vendorName?: string | null;
    amount: string;
    expectedPaymentDate: string;
    settlementDate?: string | null;
    settlementExpense?: Expense | null;
    status: AccrualStatus;
}
