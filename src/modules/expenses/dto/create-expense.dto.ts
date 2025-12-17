import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseType } from '../../../common/enums/expense-type.enum';
import { ExpenseSource } from '../../../common/enums/expense-source.enum';
import { VatTaxType } from '../../../common/enums/vat-tax-type.enum';
import { AttachmentInputDto } from './attachment-input.dto';

export class CreateExpenseDto {
  @IsEnum(ExpenseType)
  type: ExpenseType;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  vatAmount?: number;

  @IsOptional()
  @IsEnum(VatTaxType)
  vatTaxType?: VatTaxType;

  @IsDateString()
  expenseDate: string;

  @IsOptional()
  @IsDateString()
  expectedPaymentDate?: string;

  @IsOptional()
  @IsString()
  vendorId?: string; // Vendor entity ID

  @IsOptional()
  @IsString()
  vendorName?: string; // Fallback if vendorId not provided

  @IsOptional()
  @IsString()
  vendorTrn?: string;

  @IsOptional()
  @IsString()
  currency?: string; // Defaults to organization currency

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  purchaseStatus?: string; // 'Purchase - Cash Paid' or 'Purchase - Accruals'

  @IsOptional()
  @IsEnum(ExpenseSource)
  source?: ExpenseSource;

  @IsOptional()
  @IsNumber()
  ocrConfidence?: number;

  @IsOptional()
  @IsString()
  linkedAccrualExpenseId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentInputDto)
  attachments?: AttachmentInputDto[];
}
