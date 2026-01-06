import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsIn,
} from 'class-validator';
import { TaxFormType } from '../../../entities/tax-form.entity';

export class GenerateVATReturnDto {
  @IsEnum(TaxFormType)
  @IsNotEmpty()
  formType: TaxFormType;

  @IsString()
  @IsNotEmpty()
  period: string; // Format: '2024-01' for monthly, '2024-Q1' for quarterly

  @IsOptional()
  @IsIn(['pdf', 'excel', 'csv'])
  format?: 'pdf' | 'excel' | 'csv';

  @IsOptional()
  @IsString()
  notes?: string;
}

