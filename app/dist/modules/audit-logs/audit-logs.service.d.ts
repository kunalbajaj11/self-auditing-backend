import { Repository } from 'typeorm';
import { AuditLog } from '../../entities/audit-log.entity';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';
interface AuditLogInput {
    organizationId: string;
    userId?: string;
    entityType: string;
    entityId: string;
    action: AuditAction;
    changes?: Record<string, any>;
    ipAddress?: string;
}
export declare class AuditLogsService {
    private readonly auditLogsRepository;
    constructor(auditLogsRepository: Repository<AuditLog>);
    record(input: AuditLogInput): Promise<void>;
    listForOrganization(organizationId: string, filters: AuditLogFilterDto): Promise<AuditLog[]>;
}
export {};
