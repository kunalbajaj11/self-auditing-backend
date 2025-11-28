import { IsOptional, IsString, IsBoolean, IsNumber, IsIn, Min, Max } from 'class-validator';

export class UpdateTaxSettingsDto {
  @IsOptional()
  @IsString()
  taxRegistrationNumber?: string;

  @IsOptional()
  @IsString()
  taxRegistrationDate?: string;

  @IsOptional()
  @IsString()
  taxAuthority?: string;

  @IsOptional()
  @IsString()
  @IsIn(['inclusive', 'exclusive'])
  taxCalculationMethod?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxDefaultRate?: number;

  @IsOptional()
  @IsString()
  @IsIn(['standard', 'up', 'down'])
  taxRoundingMethod?: string;

  @IsOptional()
  @IsString()
  taxDefaultCode?: string;

  @IsOptional()
  @IsString()
  @IsIn(['monthly', 'quarterly', 'annually'])
  taxReportingPeriod?: string;

  @IsOptional()
  @IsString()
  taxYearEnd?: string;

  @IsOptional()
  @IsBoolean()
  taxEnableReverseCharge?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxReverseChargeRate?: number;

  @IsOptional()
  @IsBoolean()
  taxCalculateOnShipping?: boolean;

  @IsOptional()
  @IsBoolean()
  taxCalculateOnDiscounts?: boolean;

  @IsOptional()
  @IsBoolean()
  taxShowOnInvoices?: boolean;

  @IsOptional()
  @IsBoolean()
  taxShowBreakdown?: boolean;
}

