import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCategoryDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  expenseType?: string; // For system expense types (backward compatibility)

  @IsOptional()
  @IsString()
  expenseTypeId?: string; // For custom expense types
}

