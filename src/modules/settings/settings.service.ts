import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  Inject,
} from '@nestjs/common';
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
import { FileStorageService } from '../attachments/file-storage.service';
import { RegionConfigService } from '../region-config/region-config.service';
import { Region } from '../../common/enums/region.enum';
import { DataSource } from 'typeorm';

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
    private readonly fileStorageService: FileStorageService,
    private readonly regionConfigService: RegionConfigService,
    private readonly dataSource: DataSource,
    @Optional()
    @Inject(ForexRateService)
    private readonly forexRateService?: ForexRateService,
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

      // Get region config for defaults
      const region = (organization.region as Region) || Region.UAE;
      const regionConfig = this.regionConfigService.getConfig(region);

      // Initialize with default values from region config
      settings = this.settingsRepository.create({
        organization,
        // Invoice Template Defaults
        invoiceColorScheme: 'blue',
        invoiceTitle: regionConfig.invoiceTitle,
        invoiceShowCompanyDetails: true,
        invoiceShowVatDetails: true,
        invoiceShowPaymentTerms: true,
        invoiceShowPaymentMethods: true,
        invoiceShowBankDetails: false,
        invoiceShowTermsConditions: true,
        invoiceDefaultPaymentTerms: 'Net 30',
        invoiceShowFooter: true,
        invoiceShowItemDescription: true,
        invoiceShowItemQuantity: true,
        invoiceShowItemUnitPrice: true,
        invoiceShowItemTotal: true,
        invoiceEmailSubject: 'Invoice {{invoiceNumber}} from {{companyName}}',
        invoiceEmailMessage:
          'Please find attached invoice {{invoiceNumber}} for {{totalAmount}} {{currency}}.',
        // Tax Settings Defaults from region config
        taxAuthority: regionConfig.taxAuthority,
        taxCalculationMethod: 'inclusive',
        taxDefaultRate: regionConfig.defaultTaxRate,
        taxRoundingMethod: 'standard',
        taxReportingPeriod: 'monthly',
        taxCalculateOnShipping: true,
        taxCalculateOnDiscounts: false,
        taxShowOnInvoices: true,
        taxShowBreakdown: true,
        // Currency Settings Defaults
        currencyExchangeRateSource: 'api',
        currencyAutoUpdateRates: true,
        currencyUpdateFrequency: 'daily',
        currencyTrackFxGainLoss: true,
        currencyDisplayFormat: 'symbol',
        currencyRounding: 2,
        currencyRoundingMethod: 'standard',
        currencyShowOnInvoices: true,
        currencyShowExchangeRate: false,
        // Numbering Sequences Defaults
        numberingUseSequential: true,
        numberingAllowManual: false,
        numberingWarnDuplicates: true,
      });
      settings = await this.settingsRepository.save(settings);
    }

    return settings;
  }

  /**
   * Get settings with defaults applied (for cases where null values should use defaults)
   */
  async getSettingsWithDefaults(
    organizationId: string,
  ): Promise<OrganizationSettings> {
    const settings = await this.getOrCreateSettings(organizationId);

    // Apply defaults for null/undefined values
    return {
      ...settings,
      invoiceColorScheme: settings.invoiceColorScheme || 'blue',
      invoiceTitle: settings.invoiceTitle || 'TAX INVOICE',
      invoiceShowCompanyDetails: settings.invoiceShowCompanyDetails ?? true,
      invoiceShowVatDetails: settings.invoiceShowVatDetails ?? true,
      invoiceShowPaymentTerms: settings.invoiceShowPaymentTerms ?? true,
      invoiceShowPaymentMethods: settings.invoiceShowPaymentMethods ?? true,
      invoiceShowBankDetails: settings.invoiceShowBankDetails ?? false,
      invoiceShowTermsConditions: settings.invoiceShowTermsConditions ?? true,
      invoiceDefaultPaymentTerms:
        settings.invoiceDefaultPaymentTerms || 'Net 30',
      invoiceShowFooter: settings.invoiceShowFooter ?? true,
      invoiceShowItemDescription: settings.invoiceShowItemDescription ?? true,
      invoiceShowItemQuantity: settings.invoiceShowItemQuantity ?? true,
      invoiceShowItemUnitPrice: settings.invoiceShowItemUnitPrice ?? true,
      invoiceShowItemTotal: settings.invoiceShowItemTotal ?? true,
      invoiceEmailSubject:
        settings.invoiceEmailSubject ||
        'Invoice {{invoiceNumber}} from {{companyName}}',
      invoiceEmailMessage:
        settings.invoiceEmailMessage ||
        'Please find attached invoice {{invoiceNumber}} for {{totalAmount}} {{currency}}.',
      taxAuthority: settings.taxAuthority || 'Federal Tax Authority',
      taxCalculationMethod: settings.taxCalculationMethod || 'inclusive',
      taxDefaultRate: settings.taxDefaultRate ?? 5.0,
      taxRoundingMethod: settings.taxRoundingMethod || 'standard',
      taxReportingPeriod: settings.taxReportingPeriod || 'monthly',
      taxCalculateOnShipping: settings.taxCalculateOnShipping ?? true,
      taxCalculateOnDiscounts: settings.taxCalculateOnDiscounts ?? false,
      taxShowOnInvoices: settings.taxShowOnInvoices ?? true,
      taxShowBreakdown: settings.taxShowBreakdown ?? true,
      currencyExchangeRateSource: settings.currencyExchangeRateSource || 'api',
      currencyAutoUpdateRates: settings.currencyAutoUpdateRates ?? true,
      currencyUpdateFrequency: settings.currencyUpdateFrequency || 'daily',
      currencyTrackFxGainLoss: settings.currencyTrackFxGainLoss ?? true,
      currencyDisplayFormat: settings.currencyDisplayFormat || 'symbol',
      currencyRounding: settings.currencyRounding ?? 2,
      currencyRoundingMethod: settings.currencyRoundingMethod || 'standard',
      currencyShowOnInvoices: settings.currencyShowOnInvoices ?? true,
      currencyShowExchangeRate: settings.currencyShowExchangeRate ?? false,
      numberingUseSequential: settings.numberingUseSequential ?? true,
      numberingAllowManual: settings.numberingAllowManual ?? false,
      numberingWarnDuplicates: settings.numberingWarnDuplicates ?? true,
    };
  }

  // Invoice Template Settings
  async updateInvoiceTemplate(
    organizationId: string,
    dto: UpdateInvoiceTemplateDto,
  ): Promise<OrganizationSettings> {
    const settings = await this.getOrCreateSettings(organizationId);

    // Create a copy of dto to avoid modifying the original
    const updateData = { ...dto };

    // Ignore invoiceLogoUrl if it's the proxy URL (logo is only updated via upload endpoint)
    // Also ignore if it's null/undefined/empty to preserve existing logo unless explicitly removed
    if (
      updateData.invoiceLogoUrl === undefined ||
      updateData.invoiceLogoUrl?.startsWith('/api/') ||
      updateData.invoiceLogoUrl?.includes('settings/invoice-template/logo')
    ) {
      delete updateData.invoiceLogoUrl;
    } else if (
      updateData.invoiceLogoUrl === '' ||
      updateData.invoiceLogoUrl === null
    ) {
      // Explicitly remove logo
      settings.invoiceLogoUrl = null;
      delete updateData.invoiceLogoUrl;
    }

    // Ignore invoiceSignatureUrl when it's the proxy URL (signature only updated via upload endpoint)
    if (
      updateData.invoiceSignatureUrl === undefined ||
      updateData.invoiceSignatureUrl?.startsWith('/api/') ||
      updateData.invoiceSignatureUrl?.includes('settings/invoice-template/signature')
    ) {
      delete updateData.invoiceSignatureUrl;
    } else if (
      updateData.invoiceSignatureUrl === '' ||
      updateData.invoiceSignatureUrl === null
    ) {
      settings.invoiceSignatureUrl = null;
      delete updateData.invoiceSignatureUrl;
    }

    Object.assign(settings, updateData);
    return this.settingsRepository.save(settings);
  }

  async getInvoiceTemplate(
    organizationId: string,
  ): Promise<OrganizationSettings> {
    return this.getSettingsWithDefaults(organizationId);
  }

  async uploadInvoiceLogo(
    organizationId: string,
    file: Express.Multer.File,
  ): Promise<{ logoUrl: string }> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/svg+xml',
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPEG, PNG, and SVG images are allowed.',
      );
    }
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 5MB limit.');
    }

    // Upload to file storage
    const uploadResult = await this.fileStorageService.uploadFile(
      file,
      organizationId,
      'invoice-logos',
    );

    // Update settings with logo URL (store both the file key and original URL)
    const settings = await this.getOrCreateSettings(organizationId);
    settings.invoiceLogoUrl = uploadResult.fileKey; // Store the file key for retrieval
    await this.settingsRepository.save(settings);

    // Return the proxy URL that will be used to serve the logo
    return { logoUrl: '/api/settings/invoice-template/logo' };
  }

  /**
   * Get the invoice logo as a stream for proxy serving
   * This allows serving logos from private storage buckets
   */
  async getInvoiceLogoStream(organizationId: string): Promise<{
    stream: any;
    contentType?: string;
    contentLength?: number;
  } | null> {
    const settings = await this.getOrCreateSettings(organizationId);

    if (!settings.invoiceLogoUrl) {
      return null;
    }

    // The invoiceLogoUrl now stores the file key
    let fileKey = settings.invoiceLogoUrl;

    // Handle legacy URLs - extract file key from full URL if needed
    if (fileKey.startsWith('http')) {
      fileKey =
        this.fileStorageService.extractFileKeyFromUrl(fileKey) || fileKey;
    }

    try {
      const result = await this.fileStorageService.getObject(fileKey);
      return {
        stream: result.body,
        contentType: result.contentType,
        contentLength: result.contentLength,
      };
    } catch (error) {
      console.error('Error fetching logo from storage:', error);
      return null;
    }
  }

  /**
   * Get the invoice logo as a buffer for PDF generation
   */
  async getInvoiceLogoBuffer(organizationId: string): Promise<Buffer | null> {
    const logoStream = await this.getInvoiceLogoStream(organizationId);

    if (!logoStream || !logoStream.stream) {
      return null;
    }

    try {
      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of logoStream.stream) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      console.error('Error converting logo stream to buffer:', error);
      return null;
    }
  }

  async uploadInvoiceSignature(
    organizationId: string,
    file: Express.Multer.File,
  ): Promise<{ signatureUrl: string }> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPEG and PNG images are allowed for signature.',
      );
    }
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      throw new BadRequestException('Signature file size exceeds 2MB limit.');
    }
    const uploadResult = await this.fileStorageService.uploadFile(
      file,
      organizationId,
      'invoice-signatures',
    );
    const settings = await this.getOrCreateSettings(organizationId);
    settings.invoiceSignatureUrl = uploadResult.fileKey;
    await this.settingsRepository.save(settings);
    return { signatureUrl: '/api/settings/invoice-template/signature' };
  }

  async getInvoiceSignatureStream(organizationId: string): Promise<{
    stream: any;
    contentType?: string;
    contentLength?: number;
  } | null> {
    const settings = await this.getOrCreateSettings(organizationId);
    if (!settings.invoiceSignatureUrl) return null;
    let fileKey = settings.invoiceSignatureUrl;
    if (fileKey.startsWith('http')) {
      fileKey =
        this.fileStorageService.extractFileKeyFromUrl(fileKey) || fileKey;
    }
    try {
      const result = await this.fileStorageService.getObject(fileKey);
      return {
        stream: result.body,
        contentType: result.contentType,
        contentLength: result.contentLength,
      };
    } catch (error) {
      console.error('Error fetching signature from storage:', error);
      return null;
    }
  }

  async getInvoiceSignatureBuffer(organizationId: string): Promise<Buffer | null> {
    const sigStream = await this.getInvoiceSignatureStream(organizationId);
    if (!sigStream?.stream) return null;
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of sigStream.stream) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      console.error('Error converting signature stream to buffer:', error);
      return null;
    }
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
    return this.getSettingsWithDefaults(organizationId);
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
    return this.getSettingsWithDefaults(organizationId);
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

    if (!this.forexRateService) {
      throw new Error('ForexRateService is not available');
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

    if (!this.forexRateService) {
      throw new Error('ForexRateService is not available');
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
      [NumberingSequenceType.DEBIT_NOTE]: {
        prefix: 'DN',
        suffix: '',
        nextNumber: 1,
        numberLength: 5,
        resetPeriod: ResetPeriod.NEVER,
        format: 'DN-{YYYY}-{NNNNN}',
      },
      [NumberingSequenceType.QUOTE]: {
        prefix: 'QTE',
        suffix: '',
        nextNumber: 1,
        numberLength: 5,
        resetPeriod: ResetPeriod.NEVER,
        format: 'QTE-{YYYY}-{NNNNN}',
      },
      [NumberingSequenceType.SALES_ORDER]: {
        prefix: 'SO',
        suffix: '',
        nextNumber: 1,
        numberLength: 5,
        resetPeriod: ResetPeriod.NEVER,
        format: 'SO-{YYYY}-{NNNNN}',
      },
      [NumberingSequenceType.DELIVERY_CHALLAN]: {
        prefix: 'DC',
        suffix: '',
        nextNumber: 1,
        numberLength: 5,
        resetPeriod: ResetPeriod.NEVER,
        format: 'DC-{YYYY}-{NNNNN}',
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

  /**
   * Generate next number for a numbering sequence and increment it
   * Uses transaction with pessimistic lock for thread safety
   */
  async generateNextNumber(
    organizationId: string,
    type: NumberingSequenceType,
  ): Promise<string> {
    return await this.dataSource.transaction(async (manager) => {
      const sequenceRepo = manager.getRepository(NumberingSequence);

      // Get settings to check if sequential numbering is enabled
      const settings = await this.getOrCreateSettings(organizationId);
      const useSequential = settings.numberingUseSequential ?? true;

      // If sequential numbering is disabled, generate a non-sequential number
      if (!useSequential) {
        // Generate date-based number: TYPE-YYYYMMDD-HHMMSS
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const prefix =
          this.getDefaultSequence(type).prefix ||
          type.toUpperCase().substring(0, 3);
        return `${prefix}-${year}${month}${day}-${hours}${minutes}${seconds}`;
      }

      // Get sequence with pessimistic lock to prevent race conditions
      const sequence = await sequenceRepo.findOne({
        where: { organization: { id: organizationId }, type },
        relations: ['organization'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!sequence) {
        // Create new sequence
        const organization = await this.organizationRepository.findOne({
          where: { id: organizationId },
        });
        if (!organization) {
          throw new NotFoundException('Organization not found');
        }

        const defaults = this.getDefaultSequence(type);
        const newSequence = sequenceRepo.create({
          organization,
          type,
          ...defaults,
        });
        await sequenceRepo.save(newSequence);

        // Format first number
        return this.formatNumber(newSequence, newSequence.nextNumber);
      }

      // Check if reset is needed
      if (sequence.resetPeriod !== ResetPeriod.NEVER) {
        const now = new Date();
        const lastReset = sequence.lastResetDate
          ? new Date(sequence.lastResetDate)
          : null;

        let shouldReset = false;
        if (sequence.resetPeriod === ResetPeriod.YEARLY) {
          shouldReset =
            !lastReset || now.getFullYear() > lastReset.getFullYear();
        } else if (sequence.resetPeriod === ResetPeriod.QUARTERLY) {
          const currentQuarter = Math.floor(now.getMonth() / 3);
          const lastQuarter = lastReset
            ? Math.floor(lastReset.getMonth() / 3)
            : -1;
          shouldReset =
            !lastReset ||
            now.getFullYear() > lastReset.getFullYear() ||
            (now.getFullYear() === lastReset.getFullYear() &&
              currentQuarter > lastQuarter);
        } else if (sequence.resetPeriod === ResetPeriod.MONTHLY) {
          shouldReset =
            !lastReset ||
            now.getFullYear() > lastReset.getFullYear() ||
            (now.getFullYear() === lastReset.getFullYear() &&
              now.getMonth() > lastReset.getMonth());
        }

        if (shouldReset) {
          sequence.nextNumber = 1;
          sequence.lastResetDate = now.toISOString().split('T')[0];
        }
      }

      // Get current number and increment
      const currentNumber = sequence.nextNumber;
      sequence.nextNumber += 1;
      await sequenceRepo.save(sequence);

      // Format and return
      return this.formatNumber(sequence, currentNumber);
    });
  }

  /**
   * Get next number without incrementing (for preview)
   */
  async getNextNumber(
    organizationId: string,
    type: NumberingSequenceType,
  ): Promise<string> {
    const sequence = await this.getOrCreateNumberingSequence(
      organizationId,
      type,
    );
    return this.formatNumber(sequence, sequence.nextNumber);
  }

  /**
   * Format number according to sequence format
   */
  private formatNumber(sequence: NumberingSequence, number: number): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const yearShort = String(year).slice(-2);

    const paddedNumber = number.toString().padStart(sequence.numberLength, '0');

    let formatted = sequence.format || `${sequence.prefix}-{YYYY}-{NNNNN}`;

    // Replace format placeholders
    formatted = formatted.replace(/{YYYY}/g, String(year));
    formatted = formatted.replace(/{YY}/g, yearShort);
    formatted = formatted.replace(/{MM}/g, month);
    formatted = formatted.replace(/{DD}/g, day);
    formatted = formatted.replace(/{YYYYMMDD}/g, `${year}${month}${day}`);
    formatted = formatted.replace(/{MMYY}/g, `${month}${yearShort}`);
    formatted = formatted.replace(/{NNNNN}/g, paddedNumber);
    formatted = formatted.replace(/{NNNN}/g, paddedNumber.slice(-4));
    formatted = formatted.replace(/{NNN}/g, paddedNumber.slice(-3));
    formatted = formatted.replace(/{NN}/g, paddedNumber.slice(-2));
    formatted = formatted.replace(/{N}/g, paddedNumber.slice(-1));

    // Add prefix and suffix if not in format
    if (sequence.prefix && !formatted.includes(sequence.prefix)) {
      formatted = `${sequence.prefix}-${formatted}`;
    }
    if (sequence.suffix && !formatted.endsWith(sequence.suffix)) {
      formatted = `${formatted}-${sequence.suffix}`;
    }

    return formatted;
  }
}
