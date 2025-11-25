import { Repository } from 'typeorm';
import { ExchangeRate } from '../../entities/exchange-rate.entity';
import { Organization } from '../../entities/organization.entity';
export declare class ForexRateService {
    private readonly exchangeRateRepository;
    private readonly logger;
    constructor(exchangeRateRepository: Repository<ExchangeRate>);
    getRate(organization: Organization, fromCurrency: string, toCurrency: string, date?: Date): Promise<number>;
    convert(organization: Organization, amount: number, fromCurrency: string, toCurrency: string, date?: Date): Promise<number>;
    saveRate(organization: Organization, fromCurrency: string, toCurrency: string, date: string, rate: number, source?: string, isManual?: boolean): Promise<ExchangeRate>;
    private fetchRateFromAPI;
    private fetchFromExchangeRateAPI;
    updateRates(organization: Organization): Promise<void>;
    calculateFxGainLoss(organization: Organization, expenseAmount: number, expenseCurrency: string, expenseDate: Date, settlementAmount: number, settlementCurrency: string, settlementDate: Date): Promise<number>;
}
