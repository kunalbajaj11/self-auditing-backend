import { Repository } from 'typeorm';
import { Organization } from '../../entities/organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { ChangeOrganizationStatusDto } from './dto/change-status.dto';
import { ActivateOrganizationWithExpiryDto } from './dto/activate-with-expiry.dto';
import { Plan } from '../../entities/plan.entity';
import { LicenseKeysService } from '../license-keys/license-keys.service';
export declare class OrganizationsService {
    private readonly organizationsRepository;
    private readonly plansRepository;
    private readonly licenseKeysService;
    constructor(organizationsRepository: Repository<Organization>, plansRepository: Repository<Plan>, licenseKeysService: LicenseKeysService);
    private normalizeDateString;
    create(dto: CreateOrganizationDto): Promise<Organization>;
    findAll(): Promise<Organization[]>;
    findById(id: string): Promise<Organization>;
    update(id: string, dto: UpdateOrganizationDto): Promise<Organization>;
    changeStatus(id: string, dto: ChangeOrganizationStatusDto): Promise<Organization>;
    activateWithExpiry(id: string, dto: ActivateOrganizationWithExpiryDto): Promise<Organization>;
}
