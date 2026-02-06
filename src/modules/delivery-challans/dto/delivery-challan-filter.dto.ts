import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { DeliveryChallanStatus } from '../../../common/enums/delivery-challan-status.enum';

export class DeliveryChallanFilterDto {
  @IsOptional()
  @IsEnum(DeliveryChallanStatus)
  status?: DeliveryChallanStatus;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  salesOrderId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  challanNumber?: string;
}
