import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsIn,
  Min,
  Max,
  Length,
} from 'class-validator';
import { ResetPeriod } from '../../../entities/numbering-sequence.entity';

export class UpdateNumberingSequenceDto {
  @IsOptional()
  @IsString()
  @Length(0, 50)
  prefix?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  suffix?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  nextNumber?: number;

  @IsOptional()
  @IsNumber()
  @Min(3)
  @Max(10)
  numberLength?: number;

  @IsOptional()
  @IsString()
  @IsIn(Object.values(ResetPeriod))
  resetPeriod?: ResetPeriod;

  @IsOptional()
  @IsString()
  format?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
