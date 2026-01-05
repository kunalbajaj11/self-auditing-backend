import { IsOptional, IsString, IsDateString, Matches } from 'class-validator';

export class UpdatePayrollRunDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message:
      'payrollPeriod must be in format "YYYY-MM" (e.g., "2024-01")',
  })
  payrollPeriod?: string;

  @IsOptional()
  @IsDateString()
  payDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
