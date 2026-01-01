import { IsOptional, IsString, IsDateString } from 'class-validator';

export class UpdatePayrollRunDto {
  @IsOptional()
  @IsString()
  payrollPeriod?: string;

  @IsOptional()
  @IsDateString()
  payDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
