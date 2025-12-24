import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { JournalEntryAccount } from '../../../common/enums/journal-entry-account.enum';

export class UpdateJournalEntryDto {
  @IsOptional()
  @IsEnum(JournalEntryAccount)
  debitAccount?: JournalEntryAccount;

  @IsOptional()
  @IsEnum(JournalEntryAccount)
  @ValidateIf((o) => o.debitAccount && o.creditAccount && o.debitAccount !== o.creditAccount, {
    message: 'Debit account and credit account cannot be the same',
  })
  creditAccount?: JournalEntryAccount;

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
  customerVendorId?: string;

  @IsOptional()
  @IsString()
  customerVendorName?: string;

  @IsOptional()
  @IsString()
  attachmentId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

