import { AuditLogsService } from './audit-logs.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';
export declare class AuditLogsController {
    private readonly auditLogsService;
    constructor(auditLogsService: AuditLogsService);
    getForOrganization(user: AuthenticatedUser, filters: AuditLogFilterDto): Promise<import("../../entities/audit-log.entity").AuditLog[]>;
    getForSpecificOrganization(organizationId: string, filters: AuditLogFilterDto): Promise<import("../../entities/audit-log.entity").AuditLog[]>;
}
