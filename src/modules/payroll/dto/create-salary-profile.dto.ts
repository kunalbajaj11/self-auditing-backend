import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SalaryComponentDto {
  @IsNotEmpty()
  @IsString()
  componentType: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  percentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @IsNotEmpty()
  @IsString()
  calculationType: string;

  @IsOptional()
  isTaxable?: boolean;

  @IsOptional()
  @IsNumber()
  priority?: number;
}

export class CreateSalaryProfileDto {
  @IsOptional()
  @IsString()
  userId?: string; // Optional - for employees with portal access

  // Also accept user_id (snake_case) for compatibility
  @IsOptional()
  @IsString()
  user_id?: string; // Alias for userId (snake_case)

  @IsOptional()
  @IsString()
  employeeName?: string; // For employees without portal access (required if userId not provided)

  @IsOptional()
  @IsString()
  email?: string; // Email address for sending payslips

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  basicSalary: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsNotEmpty()
  @IsString()
  effectiveDate: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalaryComponentDto)
  salaryComponents?: SalaryComponentDto[];
}
