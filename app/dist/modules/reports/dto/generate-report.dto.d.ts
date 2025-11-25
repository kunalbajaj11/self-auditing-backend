import { ReportType } from '../../../common/enums/report-type.enum';
export declare class GenerateReportDto {
    type: ReportType;
    filters?: Record<string, any>;
    format?: 'json' | 'csv' | 'xlsx' | 'pdf';
}
