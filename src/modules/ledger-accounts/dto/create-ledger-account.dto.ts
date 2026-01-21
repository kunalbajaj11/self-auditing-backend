import { IsNotEmpty, IsOptional, IsString, IsEnum } from 'class-validator';

export class CreateLedgerAccountDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsEnum(['asset', 'liability', 'equity', 'revenue', 'expense'])
  category: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
}
