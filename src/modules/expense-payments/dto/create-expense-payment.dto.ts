import { IsNotEmpty, IsNumber, IsString, IsDateString, IsOptional, IsEnum, Min } from 'class-validator';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

export class CreateExpensePaymentDto {
  @IsNotEmpty()
  @IsString()
  expenseId: string;

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
}

