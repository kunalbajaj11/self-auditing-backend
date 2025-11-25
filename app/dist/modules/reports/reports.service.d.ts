import { Repository } from 'typeorm';
import { Expense } from '../../entities/expense.entity';
import { Accrual } from '../../entities/accrual.entity';
import { Report } from '../../entities/report.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { Organization } from '../../entities/organization.entity';
import { Attachment } from '../../entities/attachment.entity';
import { GenerateReportDto } from './dto/generate-report.dto';
import { ReportHistoryFilterDto } from './dto/report-history-filter.dto';
import { ReportType } from '../../common/enums/report-type.enum';
export declare class ReportsService {
    private readonly expensesRepository;
    private readonly accrualsRepository;
    private readonly reportsRepository;
    private readonly auditLogsRepository;
    private readonly organizationsRepository;
    private readonly attachmentsRepository;
    constructor(expensesRepository: Repository<Expense>, accrualsRepository: Repository<Accrual>, reportsRepository: Repository<Report>, auditLogsRepository: Repository<AuditLog>, organizationsRepository: Repository<Organization>, attachmentsRepository: Repository<Attachment>);
    listHistory(organizationId: string, filters: ReportHistoryFilterDto): Promise<Report[]>;
    findById(id: string, organizationId: string): Promise<Report | null>;
    getFilterOptions(organizationId: string): Promise<{
        vendors: string[];
    }>;
    generate(organizationId: string, userId: string, dto: GenerateReportDto): Promise<{
        type: ReportType;
        generatedAt: Date;
        data: any;
        summary?: any;
    }>;
    private extractInvoiceNumber;
    private calculateExpenseSummary;
    private buildExpenseSummary;
    private buildExpenseDetail;
    private buildAccrualSummary;
    private buildVatReport;
    private getVatCategoryBreakdown;
    private buildVendorReport;
    private buildEmployeeReport;
    private buildTrendReport;
    private applyExpenseFilters;
    private buildAuditTrailReport;
    private buildBankReconciliation;
    private buildAttachmentsReport;
    private buildTrialBalance;
}
