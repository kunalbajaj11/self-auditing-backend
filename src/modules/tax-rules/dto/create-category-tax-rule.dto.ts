import {
  IsString,
  IsOptional,
  IsUUID,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  Min,
} from 'class-validator';

export class CreateCategoryTaxRuleDto {
  @IsUUID()
  @IsNotEmpty()
  categoryId: string;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  rate: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  description?: string;
}

