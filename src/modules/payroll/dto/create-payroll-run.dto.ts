import { IsNotEmpty, IsOptional, IsString, IsArray } from 'class-validator';

export class CreatePayrollRunDto {
  @IsNotEmpty()
  @IsString()
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
