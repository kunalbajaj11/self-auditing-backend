import { LicenseKeysService } from './license-keys.service';
import { CreateLicenseKeyDto } from './dto/create-license-key.dto';
import { RenewLicenseKeyDto } from './dto/renew-license-key.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
export declare class LicenseKeysController {
    private readonly licenseKeysService;
    constructor(licenseKeysService: LicenseKeysService);
    list(): Promise<import("../../entities/license-key.entity").LicenseKey[]>;
    create(user: AuthenticatedUser, dto: CreateLicenseKeyDto): Promise<import("../../entities/license-key.entity").LicenseKey>;
    renew(id: string, dto: RenewLicenseKeyDto): Promise<import("../../entities/license-key.entity").LicenseKey>;
    revoke(id: string): Promise<import("../../entities/license-key.entity").LicenseKey>;
}
