import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsDateString,
  IsOptional,
  IsEnum,
  Min,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

export class PaymentAllocationDto {
  @IsNotEmpty()
  @IsString()
  expenseId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  allocatedAmount: number;
}

export class CreateExpensePaymentDto {
  // Legacy: single expense payment (for backward compatibility)
  @IsOptional()
  @IsString()
  expenseId?: string;

  // New: total payment amount (required when using allocations)
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsNotEmpty()
  @IsDateString()
  paymentDate: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // New: invoice-wise allocations
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, {
    message: 'At least one allocation is required when using allocations',
  })
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations?: PaymentAllocationDto[];

  // Optional: vendor name for filtering pending invoices
  @IsOptional()
  @IsString()
  vendorName?: string;
}
