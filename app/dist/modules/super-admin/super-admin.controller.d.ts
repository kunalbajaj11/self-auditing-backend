import { SuperAdminService, DashboardMetrics, OrganizationUsageItem } from './super-admin.service';
export declare class SuperAdminController {
    private readonly superAdminService;
    constructor(superAdminService: SuperAdminService);
    getDashboard(forceRefresh?: string): Promise<DashboardMetrics>;
    getUsage(forceRefresh?: string): Promise<OrganizationUsageItem[]>;
    getAuditLogs(limit?: string, skip?: string): Promise<import("../../entities/audit-log.entity").AuditLog[]>;
}
