import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PurchaseOrderStatus } from '../../../common/enums/purchase-order-status.enum';

export class PurchaseOrderFilterDto {
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsString()
  vendorName?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  poNumber?: string;
}
