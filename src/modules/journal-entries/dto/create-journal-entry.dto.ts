import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  Matches,
} from 'class-validator';

export class CreateJournalEntryDto {
  @IsNotEmpty()
  @IsString()
  @Matches(
    /^(ledger:[a-f0-9-]+|cash|bank|accounts_receivable|vat_receivable|prepaid_expenses|accounts_payable|vat_payable|customer_advances|share_capital|owner_shareholder_account|retained_earnings|sales_revenue|general_expense)$/,
    {
      message: 'Debit account must be a valid account code',
    },
  )
  debitAccount: string; // Can be enum value (e.g., 'cash') or custom ledger account (e.g., 'ledger:{id}')

  @IsNotEmpty()
  @IsString()
  @Matches(
    /^(ledger:[a-f0-9-]+|cash|bank|accounts_receivable|vat_receivable|prepaid_expenses|accounts_payable|vat_payable|customer_advances|share_capital|owner_shareholder_account|retained_earnings|sales_revenue|general_expense)$/,
    {
      message: 'Credit account must be a valid account code',
    },
  )
  @ValidateIf((o) => o.debitAccount !== o.creditAccount, {
    message: 'Debit account and credit account cannot be the same',
  })
  creditAccount: string; // Can be enum value (e.g., 'cash') or custom ledger account (e.g., 'ledger:{id}')

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
