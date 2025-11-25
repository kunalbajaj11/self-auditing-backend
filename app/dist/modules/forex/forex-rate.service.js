"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ForexRateService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForexRateService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const exchange_rate_entity_1 = require("../../entities/exchange-rate.entity");
const axios_1 = require("axios");
let ForexRateService = ForexRateService_1 = class ForexRateService {
    constructor(exchangeRateRepository) {
        this.exchangeRateRepository = exchangeRateRepository;
        this.logger = new common_1.Logger(ForexRateService_1.name);
    }
    async getRate(organization, fromCurrency, toCurrency, date = new Date()) {
        if (fromCurrency === toCurrency) {
            return 1;
        }
        const dateString = date.toISOString().split('T')[0];
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
        const closestRate = await this.exchangeRateRepository.findOne({
            where: [
                {
                    organization: { id: organization.id },
                    fromCurrency,
                    toCurrency,
                    date: (0, typeorm_2.LessThanOrEqual)(dateString),
                    isActive: true,
                },
            ],
            order: { date: 'DESC' },
        });
        if (closestRate) {
            return Number(closestRate.rate);
        }
        try {
            const rate = await this.fetchRateFromAPI(fromCurrency, toCurrency, date);
            await this.saveRate(organization, fromCurrency, toCurrency, dateString, rate);
            return rate;
        }
        catch (error) {
            this.logger.error(`Failed to fetch exchange rate: ${error.message}`);
            return 1;
        }
    }
    async convert(organization, amount, fromCurrency, toCurrency, date = new Date()) {
        const rate = await this.getRate(organization, fromCurrency, toCurrency, date);
        return Number((amount * rate).toFixed(2));
    }
    async saveRate(organization, fromCurrency, toCurrency, date, rate, source = 'manual', isManual = false) {
        let exchangeRate = await this.exchangeRateRepository.findOne({
            where: {
                organization: { id: organization.id },
                fromCurrency,
                toCurrency,
                date,
            },
        });
        if (exchangeRate) {
            if (exchangeRate.isManual) {
                return exchangeRate;
            }
            exchangeRate.rate = rate.toString();
            exchangeRate.source = source;
        }
        else {
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
    async fetchRateFromAPI(fromCurrency, toCurrency, date) {
        const apiKey = process.env.FIXER_API_KEY;
        if (!apiKey) {
            this.logger.warn('FIXER_API_KEY not set, cannot fetch exchange rates');
            throw new Error('Exchange rate API key not configured');
        }
        const dateString = date.toISOString().split('T')[0];
        const url = `http://data.fixer.io/api/${dateString}`;
        try {
            const response = await axios_1.default.get(url, {
                params: {
                    access_key: apiKey,
                    base: fromCurrency,
                    symbols: toCurrency,
                },
            });
            if (!response.data.success) {
                throw new Error(response.data.error?.info || 'Failed to fetch exchange rate');
            }
            return response.data.rates[toCurrency];
        }
        catch (error) {
            this.logger.error(`Error fetching from Fixer.io: ${error.message}`);
            return this.fetchFromExchangeRateAPI(fromCurrency, toCurrency);
        }
    }
    async fetchFromExchangeRateAPI(fromCurrency, toCurrency) {
        const apiKey = process.env.EXCHANGE_RATE_API_KEY;
        if (!apiKey) {
            this.logger.warn('EXCHANGE_RATE_API_KEY not set');
            throw new Error('Exchange rate API key not configured');
        }
        const url = `https://v6.exchangerate-api.com/v6/${apiKey}/pair/${fromCurrency}/${toCurrency}`;
        try {
            const response = await axios_1.default.get(url);
            if (response.data.result === 'success') {
                return response.data.conversion_rate;
            }
            throw new Error('Failed to fetch exchange rate');
        }
        catch (error) {
            this.logger.error(`Error fetching from ExchangeRate-API: ${error.message}`);
            throw error;
        }
    }
    async updateRates(organization) {
        const currencies = ['USD', 'EUR', 'GBP', 'INR', 'SAR', 'AED'];
        const baseCurrency = organization.baseCurrency || organization.currency || 'AED';
        const today = new Date().toISOString().split('T')[0];
        for (const currency of currencies) {
            if (currency === baseCurrency)
                continue;
            try {
                const rate = await this.fetchRateFromAPI(baseCurrency, currency, new Date());
                await this.saveRate(organization, baseCurrency, currency, today, rate, 'api', false);
            }
            catch (error) {
                this.logger.error(`Failed to update rate for ${currency}: ${error.message}`);
            }
        }
    }
    async calculateFxGainLoss(organization, expenseAmount, expenseCurrency, expenseDate, settlementAmount, settlementCurrency, settlementDate) {
        const baseCurrency = organization.baseCurrency || organization.currency || 'AED';
        const expenseInBase = await this.convert(organization, expenseAmount, expenseCurrency, baseCurrency, expenseDate);
        const settlementInBase = await this.convert(organization, settlementAmount, settlementCurrency, baseCurrency, settlementDate);
        return Number((settlementInBase - expenseInBase).toFixed(2));
    }
};
exports.ForexRateService = ForexRateService;
exports.ForexRateService = ForexRateService = ForexRateService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(exchange_rate_entity_1.ExchangeRate)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], ForexRateService);
//# sourceMappingURL=forex-rate.service.js.map