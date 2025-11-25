import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
export declare class ExchangeRate extends AbstractEntity {
    organization: Organization;
    fromCurrency: string;
    toCurrency: string;
    rate: string;
    date: string;
    source: string;
    isActive: boolean;
    isManual: boolean;
}
