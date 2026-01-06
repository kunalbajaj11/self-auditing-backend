import {
  IsString,
  IsOptional,
  IsEnum,
  IsNotEmpty,
  IsUUID,
  IsNumber,
  Min,
} from 'class-validator';
import { ExemptionType } from '../../../entities/tax-exemption.entity';

export class CreateTaxExemptionDto {
  @IsEnum(ExemptionType)
  @IsNotEmpty()
  exemptionType: ExemptionType;

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  exemptionAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  exemptionPercentage?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  thresholdAmount?: number;

  @IsString()
  @IsOptional()
  description?: string;
}

