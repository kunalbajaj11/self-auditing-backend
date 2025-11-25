import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { Expense } from './expense.entity';
import { ReconciliationRecord } from './reconciliation-record.entity';
import { ReconciliationStatus } from '../common/enums/reconciliation-status.enum';
import { TransactionType } from '../common/enums/transaction-type.enum';
export declare class SystemTransaction extends AbstractEntity {
    organization: Organization;
    transactionDate: string;
    description: string;
    amount: string;
    type: TransactionType;
    expense?: Expense | null;
    status: ReconciliationStatus;
    reconciliationRecord?: ReconciliationRecord | null;
    source: string;
}
