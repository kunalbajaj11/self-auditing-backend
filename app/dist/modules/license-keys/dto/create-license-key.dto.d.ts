import { PlanType } from '../../../common/enums/plan-type.enum';
export declare class CreateLicenseKeyDto {
    planType?: PlanType;
    maxUsers?: number;
    storageQuotaMb?: number;
    notes?: string;
    validityDays?: number;
}
