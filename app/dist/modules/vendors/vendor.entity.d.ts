import { AbstractEntity } from '../../entities/abstract.entity';
import { Organization } from '../../entities/organization.entity';
import { Expense } from '../../entities/expense.entity';
export declare class Vendor extends AbstractEntity {
    organization: Organization;
    name: string;
    displayName?: string | null;
    vendorTrn?: string | null;
    category?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    contactPerson?: string | null;
    preferredCurrency: string;
    paymentTerms?: number | null;
    isActive: boolean;
    notes?: string | null;
    expenses: Expense[];
    firstUsedAt?: Date | null;
    lastUsedAt?: Date | null;
}
