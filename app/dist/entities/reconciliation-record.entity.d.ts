import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { BankTransaction } from './bank-transaction.entity';
import { SystemTransaction } from './system-transaction.entity';
export declare class ReconciliationRecord extends AbstractEntity {
    organization: Organization;
    reconciliationDate: string;
    statementPeriodStart: string;
    statementPeriodEnd: string;
    totalBankCredits: string;
    totalBankDebits: string;
    totalMatched: number;
    totalUnmatched: number;
    adjustmentsCount: number;
    closingBalance?: string | null;
    systemClosingBalance?: string | null;
    notes?: string | null;
    createdBy?: User | null;
    bankTransactions: BankTransaction[];
    systemTransactions: SystemTransaction[];
}
