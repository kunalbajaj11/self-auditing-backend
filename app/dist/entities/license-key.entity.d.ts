import { AbstractEntity } from './abstract.entity';
import { PlanType } from '../common/enums/plan-type.enum';
import { LicenseKeyStatus } from '../common/enums/license-key-status.enum';
import { User } from './user.entity';
export declare class LicenseKey extends AbstractEntity {
    key: string;
    status: LicenseKeyStatus;
    planType?: PlanType | null;
    maxUsers?: number | null;
    storageQuotaMb?: number | null;
    expiresAt: Date;
    consumedAt?: Date | null;
    consumedByOrganizationId?: string | null;
    consumedByUserId?: string | null;
    notes?: string | null;
    createdBy?: User | null;
    createdById?: string | null;
}
