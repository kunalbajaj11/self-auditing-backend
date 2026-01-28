import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseType } from '../../../common/enums/expense-type.enum';
import { ExpenseSource } from '../../../common/enums/expense-source.enum';
import { VatTaxType } from '../../../common/enums/vat-tax-type.enum';
import { AttachmentInputDto } from './attachment-input.dto';
import { PurchaseLineItemDto } from './purchase-line-item.dto';

export class CreateExpenseDto {
  // System expense type (backward compatible). Required unless a custom expenseTypeId is provided.
  @ValidateIf((o) => !o.expenseTypeId)
  @IsEnum(ExpenseType)
  type: ExpenseType;

  // Custom expense type (new). If provided, it will be linked via Expense.expenseType relation.
  @IsOptional()
  @IsUUID()
  expenseTypeId?: string;

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
  invoiceNumber?: string;

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
  @IsUUID()
  purchaseOrderId?: string; // Link to purchase order

  @IsOptional()
  @IsString()
  productId?: string; // For inventory purchases

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number; // For inventory purchases

  @IsOptional()
  isInventoryPurchase?: boolean; // Flag to indicate this is a stock purchase

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentInputDto)
  attachments?: AttachmentInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineItemDto)
  lineItems?: PurchaseLineItemDto[]; // For item-wise purchase entry
}
