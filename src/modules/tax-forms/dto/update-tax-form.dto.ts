import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsDateString,
} from 'class-validator';
import { TaxFormStatus } from '../../../entities/tax-form.entity';

export class UpdateTaxFormDto {
  @IsEnum(TaxFormStatus)
  @IsOptional()
  status?: TaxFormStatus;

  @IsObject()
  @IsOptional()
  formData?: Record<string, any>;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  filingReference?: string;

  @IsDateString()
  @IsOptional()
  filingDate?: string;
}

