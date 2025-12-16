import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PlanType } from '../../../common/enums/plan-type.enum';

export class CreateLicenseKeyDto {
  @IsOptional()
  @IsEnum(PlanType)
  planType?: PlanType;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsers?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  storageQuotaMb?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  validityDays?: number;

  @IsNotEmpty()
  @IsEmail()
  email: string;
}
