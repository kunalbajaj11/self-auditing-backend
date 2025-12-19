import {
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

  @IsOptional()
  @IsString()
  fiscalYearStart?: string;

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
}
