import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { AuditAction } from '../common/enums/audit-action.enum';
export declare class AuditLog extends AbstractEntity {
    organization: Organization;
    user?: User | null;
    entityType: string;
    entityId: string;
    action: AuditAction;
    changes?: Record<string, any> | null;
    ipAddress?: string | null;
    timestamp: Date;
}
