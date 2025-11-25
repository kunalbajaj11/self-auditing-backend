import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
export declare class Plan extends AbstractEntity {
    name: string;
    description: string;
    maxUsers?: number | null;
    maxStorageMb?: number | null;
    maxExpensesPerMonth?: number | null;
    priceMonthly?: string | null;
    priceYearly?: string | null;
    organizations: Organization[];
}
