import { IsOptional, IsString, IsEnum } from 'class-validator';
import { PayrollRunStatus } from '../../../common/enums/payroll-run-status.enum';

export class PayrollRunFilterDto {
  @IsOptional()
  @IsEnum(PayrollRunStatus)
  status?: PayrollRunStatus;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  payrollPeriod?: string;
}
