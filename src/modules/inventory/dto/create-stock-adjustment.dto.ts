import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StockAdjustmentReason } from '../../../common/enums/stock-adjustment-reason.enum';

export class StockAdjustmentItemDto {
  @IsNotEmpty()
  @IsUUID()
  productId: string;

  @IsNotEmpty()
  @IsString()
  quantityAfter: string; // New quantity after adjustment
}

export class CreateStockAdjustmentDto {
  @IsNotEmpty()
  @IsUUID()
  locationId: string;

  @IsNotEmpty()
  @IsDateString()
  adjustmentDate: string;

  @IsEnum(StockAdjustmentReason)
  reason: StockAdjustmentReason;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockAdjustmentItemDto)
  items: StockAdjustmentItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
