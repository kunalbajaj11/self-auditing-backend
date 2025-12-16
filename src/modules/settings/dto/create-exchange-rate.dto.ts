import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsIn,
  Min,
  Length,
} from 'class-validator';

export class CreateExchangeRateDto {
  @IsString()
  @Length(3, 3)
  fromCurrency: string;

  @IsString()
  @Length(3, 3)
  toCurrency: string;

  @IsNumber()
  @Min(0)
  rate: number;

  @IsString()
  date: string;

  @IsOptional()
  @IsString()
  @IsIn(['manual', 'api', 'auto'])
  source?: string;

  @IsOptional()
  @IsBoolean()
  isManual?: boolean;
}
