import { PlanType } from '../../../common/enums/plan-type.enum';
export declare class CreateOrganizationDto {
    name: string;
    vatNumber?: string;
    address?: string;
    currency?: string;
    fiscalYearStart?: string;
    planType: PlanType;
    contactPerson?: string;
    contactEmail?: string;
    storageQuotaMb?: number;
    planId?: string;
}
