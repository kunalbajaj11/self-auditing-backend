import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { ExchangeRate } from '../../entities/exchange-rate.entity';
import { Organization } from '../../entities/organization.entity';
import axios from 'axios';

@Injectable()
export class ForexRateService {
  private readonly logger = new Logger(ForexRateService.name);

  constructor(
    @InjectRepository(ExchangeRate)
    private readonly exchangeRateRepository: Repository<ExchangeRate>,
  ) {}

  /**
   * Get exchange rate between two currencies for a specific date
   */
  async getRate(
    organization: Organization,
    fromCurrency: string,
    toCurrency: string,
    date: Date = new Date(),
  ): Promise<number> {
    // Same currency, return 1
    if (fromCurrency === toCurrency) {
      return 1;
    }

    const dateString = date.toISOString().split('T')[0];

    // Try to find existing rate
    const existingRate = await this.exchangeRateRepository.findOne({
      where: {
        organization: { id: organization.id },
        fromCurrency,
        toCurrency,
        date: dateString,
        isActive: true,
      },
    });

    if (existingRate) {
      return Number(existingRate.rate);
    }

    // Try to find closest date rate
    const closestRate = await this.exchangeRateRepository.findOne({
      where: [
        {
          organization: { id: organization.id },
          fromCurrency,
          toCurrency,
          date: LessThanOrEqual(dateString),
          isActive: true,
        },
      ],
      order: { date: 'DESC' },
    });

    if (closestRate) {
      return Number(closestRate.rate);
    }

    // If not found, fetch from API and store
    try {
      const rate = await this.fetchRateFromAPI(fromCurrency, toCurrency, date);
      await this.saveRate(
        organization,
        fromCurrency,
        toCurrency,
        dateString,
        rate,
      );
      return rate;
    } catch (error) {
      this.logger.error(`Failed to fetch exchange rate: ${error.message}`);
      // Fallback to 1 if API fails (for development)
      return 1;
    }
  }

  /**
   * Convert amount from one currency to another
   */
  async convert(
    organization: Organization,
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    date: Date = new Date(),
  ): Promise<number> {
    const rate = await this.getRate(
      organization,
      fromCurrency,
      toCurrency,
      date,
    );
    return Number((amount * rate).toFixed(2));
  }

  /**
   * Save exchange rate to database
   */
  async saveRate(
    organization: Organization,
    fromCurrency: string,
    toCurrency: string,
    date: string,
    rate: number,
    source: string = 'manual',
    isManual: boolean = false,
  ): Promise<ExchangeRate> {
    let exchangeRate = await this.exchangeRateRepository.findOne({
      where: {
        organization: { id: organization.id },
        fromCurrency,
        toCurrency,
        date,
      },
    });

    if (exchangeRate) {
      // Don't overwrite manual rates
      if (exchangeRate.isManual) {
        return exchangeRate;
      }
      exchangeRate.rate = rate.toString();
      exchangeRate.source = source;
    } else {
      exchangeRate = this.exchangeRateRepository.create({
        organization,
        fromCurrency,
        toCurrency,
        rate: rate.toString(),
        date,
        source,
        isManual,
      });
    }

    return this.exchangeRateRepository.save(exchangeRate);
  }

  /**
   * Fetch exchange rate from external API
   * Using Fixer.io API (free tier: 100 requests/month)
   */
  private async fetchRateFromAPI(
    fromCurrency: string,
    toCurrency: string,
    date: Date,
  ): Promise<number> {
    const apiKey = process.env.FIXER_API_KEY;
    if (!apiKey) {
      this.logger.warn('FIXER_API_KEY not set, cannot fetch exchange rates');
      throw new Error('Exchange rate API key not configured');
    }

    const dateString = date.toISOString().split('T')[0];
    const url = `http://data.fixer.io/api/${dateString}`;

    try {
      const response = await axios.get(url, {
        params: {
          access_key: apiKey,
          base: fromCurrency,
          symbols: toCurrency,
        },
      });

      if (!response.data.success) {
        throw new Error(
          response.data.error?.info || 'Failed to fetch exchange rate',
        );
      }

      return response.data.rates[toCurrency];
    } catch (error) {
      this.logger.error(`Error fetching from Fixer.io: ${error.message}`);
      // Fallback to ExchangeRate-API
      return this.fetchFromExchangeRateAPI(fromCurrency, toCurrency);
    }
  }

  /**
   * Fallback to ExchangeRate-API (free tier: 1,500 requests/month)
   */
  private async fetchFromExchangeRateAPI(
    fromCurrency: string,
    toCurrency: string,
  ): Promise<number> {
    const apiKey = process.env.EXCHANGE_RATE_API_KEY;
    if (!apiKey) {
      this.logger.warn('EXCHANGE_RATE_API_KEY not set');
      throw new Error('Exchange rate API key not configured');
    }

    const url = `https://v6.exchangerate-api.com/v6/${apiKey}/pair/${fromCurrency}/${toCurrency}`;

    try {
      const response = await axios.get(url);
      if (response.data.result === 'success') {
        return response.data.conversion_rate;
      }
      throw new Error('Failed to fetch exchange rate');
    } catch (error) {
      this.logger.error(
        `Error fetching from ExchangeRate-API: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Update exchange rates for all active currencies
   */
  async updateRates(organization: Organization): Promise<void> {
    const currencies = ['USD', 'EUR', 'GBP', 'INR', 'SAR', 'AED'];
    const baseCurrency =
      organization.baseCurrency || organization.currency || 'AED';
    const today = new Date().toISOString().split('T')[0];

    for (const currency of currencies) {
      if (currency === baseCurrency) continue;

      try {
        const rate = await this.fetchRateFromAPI(
          baseCurrency,
          currency,
          new Date(),
        );
        await this.saveRate(
          organization,
          baseCurrency,
          currency,
          today,
          rate,
          'api',
          false,
        );
      } catch (error) {
        this.logger.error(
          `Failed to update rate for ${currency}: ${error.message}`,
        );
      }
    }
  }

  /**
   * Calculate FX gain/loss when settling an expense
   */
  async calculateFxGainLoss(
    organization: Organization,
    expenseAmount: number,
    expenseCurrency: string,
    expenseDate: Date,
    settlementAmount: number,
    settlementCurrency: string,
    settlementDate: Date,
  ): Promise<number> {
    const baseCurrency =
      organization.baseCurrency || organization.currency || 'AED';

    // Convert expense to base currency at expense date
    const expenseInBase = await this.convert(
      organization,
      expenseAmount,
      expenseCurrency,
      baseCurrency,
      expenseDate,
    );

    // Convert settlement to base currency at settlement date
    const settlementInBase = await this.convert(
      organization,
      settlementAmount,
      settlementCurrency,
      baseCurrency,
      settlementDate,
    );

    // FX gain/loss = settlement - expense (in base currency)
    return Number((settlementInBase - expenseInBase).toFixed(2));
  }
}
