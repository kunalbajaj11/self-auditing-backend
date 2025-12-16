import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { PlanType } from '../../../common/enums/plan-type.enum';

export class RegisterWithLicenseDto {
  @IsNotEmpty()
  @IsString()
  licenseKey: string;

  @IsNotEmpty()
  @IsString()
  organizationName: string;

  @IsOptional()
  @IsString()
  vatNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  fiscalYearStart?: string;

  @IsOptional()
  @IsEnum(PlanType)
  planType?: PlanType;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  storageQuotaMb?: number;

  @IsNotEmpty()
  adminName: string;

  @IsEmail()
  adminEmail: string;

  @MinLength(8)
  adminPassword: string;

  @IsOptional()
  adminPhone?: string;
}
