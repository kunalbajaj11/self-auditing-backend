import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  IsDateString,
  IsObject,
  Min,
  Max,
} from 'class-validator';
import { TaxRuleType } from '../../../entities/tax-rule.entity';
import { Region } from '../../../common/enums/region.enum';

export class CreateTaxRuleDto {
  @IsEnum(Region)
  @IsOptional()
  region?: Region;

  @IsEnum(TaxRuleType)
  @IsNotEmpty()
  ruleType: TaxRuleType;

  @IsString()
  @IsNotEmpty()
  ruleName: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  ruleConfig?: Record<string, any>;

  @IsDateString()
  @IsOptional()
  effectiveDate?: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @Min(0)
  @Max(1000)
  @IsOptional()
  priority?: number;
}
