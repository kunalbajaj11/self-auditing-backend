import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { JournalEntryType } from '../../../common/enums/journal-entry-type.enum';
import { JournalEntryCategory } from '../../../common/enums/journal-entry-category.enum';
import { JournalEntryStatus } from '../../../common/enums/journal-entry-status.enum';

export class CreateJournalEntryDto {
  @IsNotEmpty()
  @IsEnum(JournalEntryType)
  type: JournalEntryType;

  @IsNotEmpty()
  @IsEnum(JournalEntryCategory)
  category: JournalEntryCategory;

  @IsNotEmpty()
  @IsEnum(JournalEntryStatus)
  status: JournalEntryStatus;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsNotEmpty()
  @IsDateString()
  entryDate: string;

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

