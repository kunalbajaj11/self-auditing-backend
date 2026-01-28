import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VatTaxType } from '../../../common/enums/vat-tax-type.enum';

export class PurchaseOrderLineItemDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsString()
  itemName: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  orderedQuantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  receivedQuantity?: number;

  @IsOptional()
  @IsString()
  unitOfMeasure?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  vatRate?: number;

  @IsOptional()
  vatTaxType?: VatTaxType;

  @IsOptional()
  @IsString()
  description?: string;
}
