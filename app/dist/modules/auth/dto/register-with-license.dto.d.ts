import { PlanType } from '../../../common/enums/plan-type.enum';
export declare class RegisterWithLicenseDto {
    licenseKey: string;
    organizationName: string;
    vatNumber?: string;
    address?: string;
    currency?: string;
    fiscalYearStart?: string;
    planType?: PlanType;
    contactPerson?: string;
    contactEmail?: string;
    storageQuotaMb?: number;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
    adminPhone?: string;
}
