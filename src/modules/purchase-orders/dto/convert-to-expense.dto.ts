import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ConvertLineItemDto {
  @IsUUID()
  poLineItemId: string;

  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  quantity: number; // Quantity to convert (can be partial)
}

export class ConvertToExpenseDto {
  @IsDateString()
  expenseDate: string;

  @IsOptional()
  @IsDateString()
  expectedPaymentDate?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConvertLineItemDto)
  lineItems: ConvertLineItemDto[]; // Which PO line items to convert and quantities
}
