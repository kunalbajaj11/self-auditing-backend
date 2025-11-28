import { IsString, IsNumber, IsOptional, IsBoolean, IsIn, Min, Max, Length } from 'class-validator';
import { TaxRateType } from '../../../entities/tax-rate.entity';

export class CreateTaxRateDto {
  @IsString()
  @Length(1, 20)
  code: string;

  @IsString()
  @Length(1, 100)
  name: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  rate: number;

  @IsString()
  @IsIn(Object.values(TaxRateType))
  type: TaxRateType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

