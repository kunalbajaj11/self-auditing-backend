import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { PlanType } from '../../../common/enums/plan-type.enum';
import { Region } from '../../../common/enums/region.enum';

export class CreateOrganizationDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  vatNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsEnum(PlanType)
  planType: PlanType;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  storageQuotaMb?: number;

  @IsOptional()
  @IsEnum(Region)
  region?: Region;

  @IsOptional()
  planId?: string;

  @IsOptional()
  @IsBoolean()
  enablePayroll?: boolean;

  @IsOptional()
  @IsBoolean()
  enableInventory?: boolean;

  @IsOptional()
  @IsBoolean()
  enableBulkJournalImport?: boolean;

  @IsOptional()
  @IsString()
  bankAccountHolder?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  bankIban?: string;

  @IsOptional()
  @IsString()
  bankBranch?: string;

  @IsOptional()
  @IsString()
  bankSwiftCode?: string;
}
