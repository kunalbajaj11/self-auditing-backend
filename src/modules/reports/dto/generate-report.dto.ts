import {
  IsEnum,
  IsNotEmptyObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { ReportType } from '../../../common/enums/report-type.enum';

export class GenerateReportDto {
  @IsEnum(ReportType)
  type: ReportType;

  @IsOptional()
  @IsNotEmptyObject()
  filters?: Record<string, any>;

  @IsOptional()
  @IsString()
  format?: 'json' | 'csv' | 'xlsx' | 'pdf';
}
