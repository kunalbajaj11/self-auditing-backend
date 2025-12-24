import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { JournalEntryAccount } from '../../../common/enums/journal-entry-account.enum';

export class JournalEntryFilterDto {
  @IsOptional()
  @IsEnum(JournalEntryAccount)
  debitAccount?: JournalEntryAccount;

  @IsOptional()
  @IsEnum(JournalEntryAccount)
  creditAccount?: JournalEntryAccount;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;
}

