import { ReportType } from '../../../common/enums/report-type.enum';
export declare class ScheduleReportDto {
    type: ReportType;
    filters?: Record<string, any>;
    format?: 'pdf' | 'xlsx' | 'csv';
    recipientEmail?: string;
    schedule?: 'daily' | 'weekly' | 'monthly';
    nextRun?: string;
}
