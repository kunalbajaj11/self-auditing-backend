import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { CategoriesService } from '../categories/categories.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { LicenseKeysService } from '../license-keys/license-keys.service';
import { RegisterWithLicenseDto } from './dto/register-with-license.dto';
import { ValidateLicenseDto } from './dto/validate-license.dto';
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}
export interface AuthResult {
    tokens: AuthTokens;
    user: {
        id: string;
        name: string;
        email: string;
        role: UserRole;
        organization?: {
            id: string;
            name: string;
        } | null;
    };
}
export declare class AuthService {
    private readonly usersService;
    private readonly organizationsService;
    private readonly categoriesService;
    private readonly auditLogsService;
    private readonly jwtService;
    private readonly configService;
    private readonly licenseKeysService;
    constructor(usersService: UsersService, organizationsService: OrganizationsService, categoriesService: CategoriesService, auditLogsService: AuditLogsService, jwtService: JwtService, configService: ConfigService, licenseKeysService: LicenseKeysService);
    previewLicense(dto: ValidateLicenseDto): Promise<{
        key: string;
        planType: import("../../common/enums/plan-type.enum").PlanType;
        maxUsers: number;
        storageQuotaMb: number;
        expiresAt: Date;
        status: import("../../common/enums/license-key-status.enum").LicenseKeyStatus;
    }>;
    registerWithLicense(dto: RegisterWithLicenseDto): Promise<AuthResult>;
    login(dto: LoginDto): Promise<AuthResult>;
    refreshToken(dto: RefreshTokenDto): Promise<AuthTokens>;
    logout(userId: string): Promise<void>;
    private generateTokens;
    private mapUser;
}
