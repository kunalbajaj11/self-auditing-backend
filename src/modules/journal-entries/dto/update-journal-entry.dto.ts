import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { JournalEntryType } from '../../../common/enums/journal-entry-type.enum';
import { JournalEntryCategory } from '../../../common/enums/journal-entry-category.enum';
import { JournalEntryStatus } from '../../../common/enums/journal-entry-status.enum';

export class UpdateJournalEntryDto {
  @IsOptional()
  @IsEnum(JournalEntryType)
  type?: JournalEntryType;

  @IsOptional()
  @IsEnum(JournalEntryCategory)
  category?: JournalEntryCategory;

  @IsOptional()
  @IsEnum(JournalEntryStatus)
  status?: JournalEntryStatus;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsDateString()
  entryDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

