import { IsEnum, IsOptional } from 'class-validator';
import { ReportType } from '../../../common/enums/report-type.enum';

export class ReportHistoryFilterDto {
  @IsOptional()
  @IsEnum(ReportType)
  type?: ReportType;
}

