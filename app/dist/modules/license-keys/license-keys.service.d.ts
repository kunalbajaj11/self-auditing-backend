import { Repository } from 'typeorm';
import { LicenseKey } from '../../entities/license-key.entity';
import { CreateLicenseKeyDto } from './dto/create-license-key.dto';
import { RenewLicenseKeyDto } from './dto/renew-license-key.dto';
export declare class LicenseKeysService {
    private readonly licenseKeysRepository;
    constructor(licenseKeysRepository: Repository<LicenseKey>);
    create(dto: CreateLicenseKeyDto, createdById: string): Promise<LicenseKey>;
    findAll(): Promise<LicenseKey[]>;
    renew(id: string, dto: RenewLicenseKeyDto): Promise<LicenseKey>;
    revoke(id: string): Promise<LicenseKey>;
    validateForRegistration(licenseKeyValue: string): Promise<LicenseKey>;
    markAsConsumed(licenseId: string, organizationId: string, userId: string): Promise<void>;
    findAndRenewByOrganizationId(organizationId: string, expiryDate: Date): Promise<LicenseKey>;
    findByOrganizationId(organizationId: string): Promise<LicenseKey | null>;
    private generateUniqueKey;
}
