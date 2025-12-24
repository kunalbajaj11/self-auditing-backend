import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { JournalEntryAccount } from '../../../common/enums/journal-entry-account.enum';

export class CreateJournalEntryDto {
  @IsNotEmpty()
  @IsEnum(JournalEntryAccount)
  debitAccount: JournalEntryAccount;

  @IsNotEmpty()
  @IsEnum(JournalEntryAccount)
  @ValidateIf((o) => o.debitAccount !== o.creditAccount, {
    message: 'Debit account and credit account cannot be the same',
  })
  creditAccount: JournalEntryAccount;

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

