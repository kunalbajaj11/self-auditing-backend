import { IsOptional, IsEnum, IsString, IsDateString } from 'class-validator';
import { InvoiceStatus } from '../../../common/enums/invoice-status.enum';
import { PaymentStatus } from '../../../common/enums/payment-status.enum';

export class SalesInvoiceFilterDto {
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

