import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class MatchTransactionsDto {
  @IsNotEmpty()
  @IsString()
  bankTransactionId: string;

  @IsNotEmpty()
  @IsString()
  systemTransactionId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
