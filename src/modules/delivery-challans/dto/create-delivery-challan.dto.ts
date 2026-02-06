import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeliveryChallanStatus } from '../../../common/enums/delivery-challan-status.enum';
import { DeliveryChallanLineItemDto } from './delivery-challan-line-item.dto';

export class CreateDeliveryChallanDto {
  @IsOptional()
  @IsUUID()
  salesOrderId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerTrn?: string;

  @IsDateString()
  challanDate: string;

  @IsOptional()
  @IsEnum(DeliveryChallanStatus)
  status?: DeliveryChallanStatus;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  @IsOptional()
  @IsString()
  transportMode?: string;

  @IsOptional()
  @IsString()
  lrNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryChallanLineItemDto)
  lineItems?: DeliveryChallanLineItemDto[];
}
