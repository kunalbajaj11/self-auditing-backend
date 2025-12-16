import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationSettings } from '../../entities/organization-settings.entity';
import { TaxRate, TaxRateType } from '../../entities/tax-rate.entity';
import {
  NumberingSequence,
  NumberingSequenceType,
  ResetPeriod,
} from '../../entities/numbering-sequence.entity';
import { ExchangeRate } from '../../entities/exchange-rate.entity';
import { Organization } from '../../entities/organization.entity';
import { UpdateInvoiceTemplateDto } from './dto/update-invoice-template.dto';
import { UpdateTaxSettingsDto } from './dto/update-tax-settings.dto';
import { CreateTaxRateDto } from './dto/create-tax-rate.dto';
import { UpdateTaxRateDto } from './dto/update-tax-rate.dto';
import { UpdateCurrencySettingsDto } from './dto/update-currency-settings.dto';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { UpdateNumberingSequenceDto } from './dto/update-numbering-sequence.dto';
import { UpdateNumberingSettingsDto } from './dto/update-numbering-settings.dto';
import { ForexRateService } from '../forex/forex-rate.service';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(OrganizationSettings)
    private readonly settingsRepository: Repository<OrganizationSettings>,
    @InjectRepository(TaxRate)
    private readonly taxRateRepository: Repository<TaxRate>,
    @InjectRepository(NumberingSequence)
    private readonly numberingSequenceRepository: Repository<NumberingSequence>,
    @InjectRepository(ExchangeRate)
    private readonly exchangeRateRepository: Repository<ExchangeRate>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    private readonly forexRateService: ForexRateService,
  ) {}

  // Organization Settings
  async getOrCreateSettings(
    organizationId: string,
  ): Promise<OrganizationSettings> {
    let settings = await this.settingsRepository.findOne({
      where: { organization: { id: organizationId } },
      relations: ['organization'],
    });

    if (!settings) {
      const organization = await this.organizationRepository.findOne({
        where: { id: organizationId },
      });
      if (!organization) {
        throw new NotFoundException('Organization not found');
      }

      settings = this.settingsRepository.create({
        organization,
      });
      settings = await this.settingsRepository.save(settings);
    }

    return settings;
  }

  // Invoice Template Settings
  async updateInvoiceTemplate(
    organizationId: string,
    dto: UpdateInvoiceTemplateDto,
  ): Promise<OrganizationSettings> {
    const settings = await this.getOrCreateSettings(organizationId);
    Object.assign(settings, dto);
    return this.settingsRepository.save(settings);
  }

  async getInvoiceTemplate(
    organizationId: string,
  ): Promise<OrganizationSettings> {
    return this.getOrCreateSettings(organizationId);
  }

  // Tax Settings
  async updateTaxSettings(
    organizationId: string,
    dto: UpdateTaxSettingsDto,
  ): Promise<OrganizationSettings> {
    const settings = await this.getOrCreateSettings(organizationId);
    Object.assign(settings, dto);
    return this.settingsRepository.save(settings);
  }

  async getTaxSettings(organizationId: string): Promise<OrganizationSettings> {
    return this.getOrCreateSettings(organizationId);
  }

  // Tax Rates
  async getTaxRates(organizationId: string): Promise<TaxRate[]> {
    return this.taxRateRepository.find({
      where: { organization: { id: organizationId } },
      order: { createdAt: 'DESC' },
    });
  }

  async createTaxRate(
    organizationId: string,
    dto: CreateTaxRateDto,
  ): Promise<TaxRate> {
    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const taxRate = this.taxRateRepository.create({
      organization,
      ...dto,
      isActive: dto.isActive ?? true,
    });

    return this.taxRateRepository.save(taxRate);
  }

  async updateTaxRate(
    organizationId: string,
    id: string,
    dto: UpdateTaxRateDto,
  ): Promise<TaxRate> {
    const taxRate = await this.taxRateRepository.findOne({
      where: { id, organization: { id: organizationId } },
    });

    if (!taxRate) {
      throw new NotFoundException('Tax rate not found');
    }

    Object.assign(taxRate, dto);
    return this.taxRateRepository.save(taxRate);
  }

  async deleteTaxRate(organizationId: string, id: string): Promise<void> {
    const taxRate = await this.taxRateRepository.findOne({
      where: { id, organization: { id: organizationId } },
    });

    if (!taxRate) {
      throw new NotFoundException('Tax rate not found');
    }

    await this.taxRateRepository.remove(taxRate);
  }

  // Currency Settings
  async updateCurrencySettings(
    organizationId: string,
    dto: UpdateCurrencySettingsDto,
  ): Promise<OrganizationSettings> {
    const settings = await this.getOrCreateSettings(organizationId);
    Object.assign(settings, dto);
    return this.settingsRepository.save(settings);
  }

  async getCurrencySettings(
    organizationId: string,
  ): Promise<OrganizationSettings> {
    return this.getOrCreateSettings(organizationId);
  }

  // Exchange Rates
  async getExchangeRates(organizationId: string): Promise<ExchangeRate[]> {
    return this.exchangeRateRepository.find({
      where: { organization: { id: organizationId } },
      order: { date: 'DESC', createdAt: 'DESC' },
    });
  }

  async createExchangeRate(
    organizationId: string,
    dto: CreateExchangeRateDto,
  ): Promise<ExchangeRate> {
    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return this.forexRateService.saveRate(
      organization,
      dto.fromCurrency,
      dto.toCurrency,
      dto.date,
      dto.rate,
      dto.source || 'manual',
      dto.isManual ?? true,
    );
  }

  async updateExchangeRate(
    organizationId: string,
    id: string,
    rate: number,
  ): Promise<ExchangeRate> {
    const exchangeRate = await this.exchangeRateRepository.findOne({
      where: { id, organization: { id: organizationId } },
      relations: ['organization'],
    });

    if (!exchangeRate) {
      throw new NotFoundException('Exchange rate not found');
    }

    exchangeRate.rate = rate.toString();
    return this.exchangeRateRepository.save(exchangeRate);
  }

  async deleteExchangeRate(organizationId: string, id: string): Promise<void> {
    const exchangeRate = await this.exchangeRateRepository.findOne({
      where: { id, organization: { id: organizationId } },
    });

    if (!exchangeRate) {
      throw new NotFoundException('Exchange rate not found');
    }

    await this.exchangeRateRepository.remove(exchangeRate);
  }

  async updateExchangeRatesFromAPI(organizationId: string): Promise<void> {
    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    await this.forexRateService.updateRates(organization);
  }

  // Numbering Sequences
  async updateNumberingSettings(
    organizationId: string,
    dto: UpdateNumberingSettingsDto,
  ): Promise<OrganizationSettings> {
    const settings = await this.getOrCreateSettings(organizationId);
    Object.assign(settings, dto);
    return this.settingsRepository.save(settings);
  }

  async getNumberingSequences(
    organizationId: string,
  ): Promise<NumberingSequence[]> {
    return this.numberingSequenceRepository.find({
      where: { organization: { id: organizationId } },
      order: { type: 'ASC' },
    });
  }

  async getOrCreateNumberingSequence(
    organizationId: string,
    type: NumberingSequenceType,
  ): Promise<NumberingSequence> {
    let sequence = await this.numberingSequenceRepository.findOne({
      where: { organization: { id: organizationId }, type },
      relations: ['organization'],
    });

    if (!sequence) {
      const organization = await this.organizationRepository.findOne({
        where: { id: organizationId },
      });
      if (!organization) {
        throw new NotFoundException('Organization not found');
      }

      const defaults = this.getDefaultSequence(type);
      sequence = this.numberingSequenceRepository.create({
        organization,
        type,
        ...defaults,
      });
      sequence = await this.numberingSequenceRepository.save(sequence);
    }

    return sequence;
  }

  async updateNumberingSequence(
    organizationId: string,
    type: NumberingSequenceType,
    dto: UpdateNumberingSequenceDto,
  ): Promise<NumberingSequence> {
    const sequence = await this.getOrCreateNumberingSequence(
      organizationId,
      type,
    );
    Object.assign(sequence, dto);
    return this.numberingSequenceRepository.save(sequence);
  }

  async resetNumberingSequence(
    organizationId: string,
    type: NumberingSequenceType,
  ): Promise<NumberingSequence> {
    const sequence = await this.getOrCreateNumberingSequence(
      organizationId,
      type,
    );
    sequence.nextNumber = 1;
    sequence.lastResetDate = new Date().toISOString().split('T')[0];
    return this.numberingSequenceRepository.save(sequence);
  }

  private getDefaultSequence(
    type: NumberingSequenceType,
  ): Partial<NumberingSequence> {
    const defaults: Record<
      NumberingSequenceType,
      Partial<NumberingSequence>
    > = {
      [NumberingSequenceType.INVOICE]: {
        prefix: 'INV',
        suffix: '',
        nextNumber: 1,
        numberLength: 5,
        resetPeriod: ResetPeriod.NEVER,
        format: 'INV-{YYYY}-{NNNNN}',
      },
      [NumberingSequenceType.CREDIT_NOTE]: {
        prefix: 'CN',
        suffix: '',
        nextNumber: 1,
        numberLength: 5,
        resetPeriod: ResetPeriod.NEVER,
        format: 'CN-{YYYY}-{NNNNN}',
      },
      [NumberingSequenceType.QUOTE]: {
        prefix: 'QTE',
        suffix: '',
        nextNumber: 1,
        numberLength: 5,
        resetPeriod: ResetPeriod.NEVER,
        format: 'QTE-{YYYY}-{NNNNN}',
      },
      [NumberingSequenceType.PURCHASE_ORDER]: {
        prefix: 'PO',
        suffix: '',
        nextNumber: 1,
        numberLength: 5,
        resetPeriod: ResetPeriod.NEVER,
        format: 'PO-{YYYY}-{NNNNN}',
      },
      [NumberingSequenceType.PAYMENT_RECEIPT]: {
        prefix: 'REC',
        suffix: '',
        nextNumber: 1,
        numberLength: 5,
        resetPeriod: ResetPeriod.NEVER,
        format: 'REC-{YYYY}-{NNNNN}',
      },
      [NumberingSequenceType.EXPENSE]: {
        prefix: 'EXP',
        suffix: '',
        nextNumber: 1,
        numberLength: 5,
        resetPeriod: ResetPeriod.NEVER,
        format: 'EXP-{YYYY}-{NNNNN}',
      },
    };

    return defaults[type] || {};
  }
}
