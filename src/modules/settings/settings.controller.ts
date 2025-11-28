import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { UpdateInvoiceTemplateDto } from './dto/update-invoice-template.dto';
import { UpdateTaxSettingsDto } from './dto/update-tax-settings.dto';
import { CreateTaxRateDto } from './dto/create-tax-rate.dto';
import { UpdateTaxRateDto } from './dto/update-tax-rate.dto';
import { UpdateCurrencySettingsDto } from './dto/update-currency-settings.dto';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { UpdateNumberingSequenceDto } from './dto/update-numbering-sequence.dto';
import { UpdateNumberingSettingsDto } from './dto/update-numbering-settings.dto';
import { NumberingSequenceType } from '../../entities/numbering-sequence.entity';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(UserRole.ADMIN)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // Invoice Template
  @Get('invoice-template')
  async getInvoiceTemplate(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getInvoiceTemplate(
      user?.organizationId as string,
    );
  }

  @Patch('invoice-template')
  async updateInvoiceTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateInvoiceTemplateDto,
  ) {
    return this.settingsService.updateInvoiceTemplate(
      user?.organizationId as string,
      dto,
    );
  }

  // Tax Settings
  @Get('tax')
  async getTaxSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getTaxSettings(user?.organizationId as string);
  }

  @Patch('tax')
  async updateTaxSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTaxSettingsDto,
  ) {
    return this.settingsService.updateTaxSettings(
      user?.organizationId as string,
      dto,
    );
  }

  // Tax Rates
  @Get('tax/rates')
  async getTaxRates(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getTaxRates(user?.organizationId as string);
  }

  @Post('tax/rates')
  async createTaxRate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTaxRateDto,
  ) {
    return this.settingsService.createTaxRate(
      user?.organizationId as string,
      dto,
    );
  }

  @Patch('tax/rates/:id')
  async updateTaxRate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaxRateDto,
  ) {
    return this.settingsService.updateTaxRate(
      user?.organizationId as string,
      id,
      dto,
    );
  }

  @Delete('tax/rates/:id')
  async deleteTaxRate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.settingsService.deleteTaxRate(
      user?.organizationId as string,
      id,
    );
    return { success: true };
  }

  // Currency Settings
  @Get('currency')
  async getCurrencySettings(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getCurrencySettings(
      user?.organizationId as string,
    );
  }

  @Patch('currency')
  async updateCurrencySettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCurrencySettingsDto,
  ) {
    return this.settingsService.updateCurrencySettings(
      user?.organizationId as string,
      dto,
    );
  }

  // Exchange Rates
  @Get('currency/exchange-rates')
  async getExchangeRates(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getExchangeRates(
      user?.organizationId as string,
    );
  }

  @Post('currency/exchange-rates')
  async createExchangeRate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateExchangeRateDto,
  ) {
    return this.settingsService.createExchangeRate(
      user?.organizationId as string,
      dto,
    );
  }

  @Patch('currency/exchange-rates/:id')
  async updateExchangeRate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('rate') rate: number,
  ) {
    return this.settingsService.updateExchangeRate(
      user?.organizationId as string,
      id,
      rate,
    );
  }

  @Delete('currency/exchange-rates/:id')
  async deleteExchangeRate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.settingsService.deleteExchangeRate(
      user?.organizationId as string,
      id,
    );
    return { success: true };
  }

  @Post('currency/exchange-rates/update-from-api')
  async updateExchangeRatesFromAPI(@CurrentUser() user: AuthenticatedUser) {
    await this.settingsService.updateExchangeRatesFromAPI(
      user?.organizationId as string,
    );
    return { success: true };
  }

  // Numbering Sequences
  @Get('numbering')
  async getNumberingSettings(@CurrentUser() user: AuthenticatedUser) {
    const settings = await this.settingsService.getOrCreateSettings(
      user?.organizationId as string,
    );
    const sequences = await this.settingsService.getNumberingSequences(
      user?.organizationId as string,
    );
    return {
      settings: {
        numberingUseSequential: settings.numberingUseSequential,
        numberingAllowManual: settings.numberingAllowManual,
        numberingWarnDuplicates: settings.numberingWarnDuplicates,
      },
      sequences,
    };
  }

  @Patch('numbering')
  async updateNumberingSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNumberingSettingsDto,
  ) {
    return this.settingsService.updateNumberingSettings(
      user?.organizationId as string,
      dto,
    );
  }

  @Get('numbering/sequences')
  async getNumberingSequences(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getNumberingSequences(
      user?.organizationId as string,
    );
  }

  @Patch('numbering/sequences/:type')
  async updateNumberingSequence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type') type: NumberingSequenceType,
    @Body() dto: UpdateNumberingSequenceDto,
  ) {
    return this.settingsService.updateNumberingSequence(
      user?.organizationId as string,
      type,
      dto,
    );
  }

  @Post('numbering/sequences/:type/reset')
  async resetNumberingSequence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type') type: NumberingSequenceType,
  ) {
    return this.settingsService.resetNumberingSequence(
      user?.organizationId as string,
      type,
    );
  }
}

