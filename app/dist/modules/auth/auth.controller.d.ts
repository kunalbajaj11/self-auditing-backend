import { AuthService, AuthResult, AuthTokens } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RegisterWithLicenseDto } from './dto/register-with-license.dto';
import { ValidateLicenseDto } from './dto/validate-license.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(dto: LoginDto): Promise<AuthResult>;
    register(dto: RegisterWithLicenseDto): Promise<AuthResult>;
    validateLicense(dto: ValidateLicenseDto): Promise<{
        key: string;
        planType: import("../../common/enums/plan-type.enum").PlanType;
        maxUsers: number;
        storageQuotaMb: number;
        expiresAt: Date;
        status: import("../../common/enums/license-key-status.enum").LicenseKeyStatus;
    }>;
    refresh(dto: RefreshTokenDto): Promise<AuthTokens>;
    logout(user: AuthenticatedUser): Promise<{
        success: boolean;
    }>;
}
