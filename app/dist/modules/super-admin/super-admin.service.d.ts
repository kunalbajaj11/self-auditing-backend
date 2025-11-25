import { Repository } from 'typeorm';
import { Organization } from '../../entities/organization.entity';
import { Expense } from '../../entities/expense.entity';
import { User } from '../../entities/user.entity';
import { Attachment } from '../../entities/attachment.entity';
import { Accrual } from '../../entities/accrual.entity';
import { AuditLog } from '../../entities/audit-log.entity';
export interface DashboardMetrics {
    totalOrganizations: number;
    activeOrganizations: number;
    inactiveOrganizations: number;
    totalUsers: number;
    totalExpensesProcessed: number;
    totalAccruals: number;
    pendingAccruals: number;
    storageUsedMb: number;
    latestAuditLogs: Array<{
        id: string;
        organizationId: string;
        entityType: string;
        action: string;
        timestamp: string;
    }>;
}
export interface OrganizationUsageItem {
    id: string;
    name: string;
    planType: string;
    status: string;
    userCount: number;
    expenseCount: number;
    accrualCount: number;
    storageUsedMb: number;
    rankingScore: number;
    createdAt: Date;
}
export declare class SuperAdminService {
    private readonly organizationsRepository;
    private readonly expensesRepository;
    private readonly usersRepository;
    private readonly attachmentsRepository;
    private readonly accrualsRepository;
    private readonly auditLogsRepository;
    private dashboardMetricsCache;
    private organizationUsageCache;
    constructor(organizationsRepository: Repository<Organization>, expensesRepository: Repository<Expense>, usersRepository: Repository<User>, attachmentsRepository: Repository<Attachment>, accrualsRepository: Repository<Accrual>, auditLogsRepository: Repository<AuditLog>);
    private isCacheValid;
    getDashboardMetrics(forceRefresh?: boolean): Promise<DashboardMetrics>;
    getOrganizationUsage(forceRefresh?: boolean): Promise<OrganizationUsageItem[]>;
    getLatestAuditLogs(limit?: number, skip?: number): Promise<AuditLog[]>;
    private getTotalAttachmentSize;
}
