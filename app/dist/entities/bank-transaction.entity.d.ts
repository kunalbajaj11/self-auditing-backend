import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { TransactionType } from '../common/enums/transaction-type.enum';
import { ReconciliationStatus } from '../common/enums/reconciliation-status.enum';
import { ReconciliationRecord } from './reconciliation-record.entity';
export declare class BankTransaction extends AbstractEntity {
    organization: Organization;
    transactionDate: string;
    description: string;
    amount: string;
    type: TransactionType;
    balance?: string | null;
    reference?: string | null;
    sourceFile: string;
    status: ReconciliationStatus;
    reconciliationRecord?: ReconciliationRecord | null;
    uploadedBy?: User | null;
}
