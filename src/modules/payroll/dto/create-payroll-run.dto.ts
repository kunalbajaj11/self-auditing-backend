import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  Matches,
} from 'class-validator';

export class CreatePayrollRunDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message:
      'payrollPeriod must be in format "YYYY-MM" (e.g., "2024-01")',
  })
  payrollPeriod: string; // e.g., "2024-01"

  @IsNotEmpty()
  @IsString()
  payDate: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[]; // If provided, only process these users

  @IsOptional()
  @IsString()
  notes?: string;
}
