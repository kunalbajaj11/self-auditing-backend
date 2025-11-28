import { IsString, IsNumber, IsOptional, IsBoolean, IsIn, Min, Max, Length } from 'class-validator';
import { TaxRateType } from '../../../entities/tax-rate.entity';

export class UpdateTaxRateDto {
  @IsOptional()
  @IsString()
  @Length(1, 20)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  rate?: number;

  @IsOptional()
  @IsString()
  @IsIn(Object.values(TaxRateType))
  type?: TaxRateType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

