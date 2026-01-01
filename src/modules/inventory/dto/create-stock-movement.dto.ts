import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { StockMovementType } from '../../../common/enums/stock-movement-type.enum';

export class CreateStockMovementDto {
  @IsNotEmpty()
  @IsUUID()
  productId: string;

  @IsNotEmpty()
  @IsUUID()
  locationId: string;

  @IsEnum(StockMovementType)
  movementType: StockMovementType;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  quantity: number; // Positive for increase, negative for decrease

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  unitCost: number;

  @IsOptional()
  @IsString()
  referenceType?: string; // e.g., "sales_invoice", "expense"

  @IsOptional()
  @IsUUID()
  referenceId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
