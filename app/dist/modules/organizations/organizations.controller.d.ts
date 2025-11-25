import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { ChangeOrganizationStatusDto } from './dto/change-status.dto';
import { ActivateOrganizationWithExpiryDto } from './dto/activate-with-expiry.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
export declare class OrganizationsController {
    private readonly organizationsService;
    constructor(organizationsService: OrganizationsService);
    list(): Promise<{
        id: string;
        name: string;
        planType: import("../../common/enums/plan-type.enum").PlanType;
        status: import("../../common/enums/organization-status.enum").OrganizationStatus;
        contactEmail: string;
        createdAt: Date;
        plan: {
            id: string;
            name: string;
        };
    }[]>;
    create(dto: CreateOrganizationDto): Promise<{
        id: string;
        name: string;
        planType: import("../../common/enums/plan-type.enum").PlanType;
        status: import("../../common/enums/organization-status.enum").OrganizationStatus;
    }>;
    getMyOrganization(user: AuthenticatedUser): Promise<{
        id: string;
        name: string;
        currency: string;
        fiscalYearStart: string;
        planType: import("../../common/enums/plan-type.enum").PlanType;
        status: import("../../common/enums/organization-status.enum").OrganizationStatus;
        storageQuotaMb: number;
        contactPerson: string;
        contactEmail: string;
    }>;
    updateMyOrganization(user: AuthenticatedUser, dto: UpdateOrganizationDto): Promise<{
        id: string;
        name: string;
        currency: string;
        fiscalYearStart: string;
        status: import("../../common/enums/organization-status.enum").OrganizationStatus;
        contactPerson: string;
        contactEmail: string;
        storageQuotaMb: number;
        planType: import("../../common/enums/plan-type.enum").PlanType;
    }>;
    get(id: string): Promise<import("../../entities/organization.entity").Organization>;
    update(id: string, dto: UpdateOrganizationDto): Promise<import("../../entities/organization.entity").Organization>;
    changeStatus(id: string, dto: ChangeOrganizationStatusDto): Promise<import("../../entities/organization.entity").Organization>;
    activateWithExpiry(id: string, dto: ActivateOrganizationWithExpiryDto): Promise<import("../../entities/organization.entity").Organization>;
}
