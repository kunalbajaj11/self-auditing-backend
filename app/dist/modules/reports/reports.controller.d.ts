import { Response } from 'express';
import { ReportsService } from './reports.service';
import { ReportGeneratorService } from './report-generator.service';
import { EmailService } from '../notifications/email.service';
import { Repository } from 'typeorm';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ReportHistoryFilterDto } from './dto/report-history-filter.dto';
import { GenerateReportDto } from './dto/generate-report.dto';
import { ScheduleReportDto } from './dto/schedule-report.dto';
export declare class ReportsController {
    private readonly reportsService;
    private readonly reportGeneratorService;
    private readonly emailService;
    private readonly organizationsRepository;
    private readonly usersRepository;
    constructor(reportsService: ReportsService, reportGeneratorService: ReportGeneratorService, emailService: EmailService, organizationsRepository: Repository<Organization>, usersRepository: Repository<User>);
    history(user: AuthenticatedUser, filters: ReportHistoryFilterDto): Promise<import("../../entities/report.entity").Report[]>;
    getFilterOptions(user: AuthenticatedUser): Promise<{
        vendors: string[];
    }>;
    generate(user: AuthenticatedUser, dto: GenerateReportDto): Promise<{
        type: import("../../common/enums/report-type.enum").ReportType;
        generatedAt: Date;
        data: any;
        summary?: any;
    }>;
    download(id: string, format: 'pdf' | 'xlsx' | 'csv', user: AuthenticatedUser, res: Response): Promise<Response<any, Record<string, any>>>;
    schedule(user: AuthenticatedUser, dto: ScheduleReportDto): Promise<{
        success: boolean;
        message: string;
        report: {
            type: import("../../common/enums/report-type.enum").ReportType;
            generatedAt: Date;
            data: any;
            summary?: any;
        };
    }>;
}
