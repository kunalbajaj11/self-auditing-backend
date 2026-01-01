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
  @ValidateIf(
    (o) =>
      o.debitAccount && o.creditAccount && o.debitAccount !== o.creditAccount,
    {
      message: 'Debit account and credit account cannot be the same',
    },
  )
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
  vendorTrn?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  vatAmount?: number;

  @IsOptional()
  @IsString()
  vatTaxType?: string; // 'standard', 'zero_rated', 'exempt', 'reverse_charge'

  @IsOptional()
  @IsString()
  subAccount?: string; // For sub-heads like "Prepaid Rent" under "Prepaid Expenses"

  @IsOptional()
  @IsString()
  attachmentId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
