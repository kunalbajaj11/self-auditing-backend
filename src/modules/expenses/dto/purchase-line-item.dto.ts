import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
  IsNotEmpty,
} from 'class-validator';
import { VatTaxType } from '../../../common/enums/vat-tax-type.enum';

export class PurchaseLineItemDto {
  @IsOptional()
  @IsString()
  productId?: string; // If linking to existing product

  @IsNotEmpty()
  @IsString()
  itemName: string; // Product name or custom item name

  @IsOptional()
  @IsString()
  sku?: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsOptional()
  @IsString()
  unitOfMeasure?: string; // e.g., 'unit', 'kg', 'hour', 'day', 'm2'

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  vatRate?: number; // VAT rate percentage (defaults to product or settings)

  @IsOptional()
  @IsEnum(VatTaxType)
  vatTaxType?: VatTaxType;

  @IsOptional()
  @IsString()
  description?: string;
}

