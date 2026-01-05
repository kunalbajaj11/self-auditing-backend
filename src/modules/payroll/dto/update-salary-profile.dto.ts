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
import { SalaryComponentDto } from './create-salary-profile.dto';

export class UpdateSalaryProfileDto {
  @IsOptional()
  @IsString()
  userId?: string; // Link to a user (for employees with portal access)

  @IsOptional()
  @IsString()
  employeeName?: string;

  @IsOptional()
  @IsString()
  email?: string; // Email address for sending payslips

  @IsOptional()
  @IsNumber()
  @Min(0)
  basicSalary?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalaryComponentDto)
  salaryComponents?: SalaryComponentDto[];

  @IsOptional()
  isActive?: boolean;
}
