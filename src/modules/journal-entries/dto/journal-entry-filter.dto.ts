import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { JournalEntryType } from '../../../common/enums/journal-entry-type.enum';
import { JournalEntryCategory } from '../../../common/enums/journal-entry-category.enum';
import { JournalEntryStatus } from '../../../common/enums/journal-entry-status.enum';

export class JournalEntryFilterDto {
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
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

