import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { AccrualStatus } from '../../../common/enums/accrual-status.enum';

export class AccrualFilterDto {
  @IsOptional()
  @IsEnum(AccrualStatus)
  status?: AccrualStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
