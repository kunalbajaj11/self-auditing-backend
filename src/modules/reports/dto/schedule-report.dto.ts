import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { ReportType } from '../../../common/enums/report-type.enum';

export class ScheduleReportDto {
  @IsEnum(ReportType)
  type: ReportType;

  @IsOptional()
  filters?: Record<string, any>;

  @IsOptional()
  @IsString()
  format?: 'pdf' | 'xlsx' | 'csv';

  @IsOptional()
  @IsString()
  recipientEmail?: string;

  @IsOptional()
  @IsString()
  schedule?: 'daily' | 'weekly' | 'monthly';

  @IsOptional()
  @IsDateString()
  nextRun?: string;
}
