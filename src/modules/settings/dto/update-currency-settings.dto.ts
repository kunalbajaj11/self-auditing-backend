import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsIn,
  Min,
  Max,
} from 'class-validator';

export class UpdateCurrencySettingsDto {
  @IsOptional()
  @IsString()
  @IsIn(['manual', 'api', 'auto'])
  currencyExchangeRateSource?: string;

  @IsOptional()
  @IsBoolean()
  currencyAutoUpdateRates?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['daily', 'weekly', 'monthly'])
  currencyUpdateFrequency?: string;

  @IsOptional()
  @IsBoolean()
  currencyTrackFxGainLoss?: boolean;

  @IsOptional()
  @IsString()
  currencyFxGainLossAccount?: string;

  @IsOptional()
  @IsString()
  @IsIn(['symbol', 'code', 'both'])
  currencyDisplayFormat?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(4)
  currencyRounding?: number;

  @IsOptional()
  @IsString()
  @IsIn(['standard', 'up', 'down'])
  currencyRoundingMethod?: string;

  @IsOptional()
  @IsBoolean()
  currencyShowOnInvoices?: boolean;

  @IsOptional()
  @IsBoolean()
  currencyShowExchangeRate?: boolean;
}
