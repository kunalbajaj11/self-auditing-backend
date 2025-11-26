import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { AccountType } from '../../../entities/chart-of-accounts.entity';
import { Transform } from 'class-transformer';

export class ChartOfAccountFilterDto {
  @IsOptional()
  @IsEnum(AccountType)
  accountType?: AccountType;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  isActive?: boolean;

  @IsOptional()
  search?: string;
}

