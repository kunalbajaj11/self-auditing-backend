import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { CategoriesService } from '../categories/categories.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { comparePassword, hashPassword } from '../../utils/password.util';
import { User } from '../../entities/user.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { LicenseKeysService } from '../license-keys/license-keys.service';
import { RegisterWithLicenseDto } from './dto/register-with-license.dto';
import { ValidateLicenseDto } from './dto/validate-license.dto';
import { OrganizationStatus } from '../../common/enums/organization-status.enum';

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
    organization?: { id: string; name: string } | null;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly organizationsService: OrganizationsService,
    private readonly categoriesService: CategoriesService,
    private readonly auditLogsService: AuditLogsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly licenseKeysService: LicenseKeysService,
  ) {}

  async previewLicense(dto: ValidateLicenseDto) {
    const license = await this.licenseKeysService.validateForRegistration(
      dto.licenseKey.trim(),
    );
    return {
      key: license.key,
      planType: license.planType,
      maxUsers: license.maxUsers,
      storageQuotaMb: license.storageQuotaMb,
      expiresAt: license.expiresAt,
      status: license.status,
    };
  }

  async registerWithLicense(
    dto: RegisterWithLicenseDto,
  ): Promise<AuthResult> {
    const license = await this.licenseKeysService.validateForRegistration(
      dto.licenseKey.trim(),
    );

    const planType = license.planType ?? dto.planType;
    if (!planType) {
      throw new BadRequestException(
        'Plan type must be provided by the license or registration form.',
      );
    }

    const organization = await this.organizationsService.create({
      name: dto.organizationName,
      planType,
      vatNumber: dto.vatNumber,
      address: dto.address,
      currency: dto.currency,
      fiscalYearStart: dto.fiscalYearStart,
      contactPerson: dto.contactPerson ?? undefined,
      contactEmail: dto.contactEmail ?? dto.adminEmail,
      storageQuotaMb:
        license.storageQuotaMb ?? dto.storageQuotaMb ?? undefined,
      planId: undefined,
    });

    await this.categoriesService.ensureDefaultsForOrganization(organization.id);

    const adminUser = await this.usersService.createForOrganization(
      organization.id,
      {
        name: dto.adminName,
        email: dto.adminEmail,
        password: dto.adminPassword,
        role: UserRole.ADMIN,
        phone: dto.adminPhone,
      },
      [UserRole.ADMIN],
    );

    await this.licenseKeysService.markAsConsumed(
      license.id,
      organization.id,
      adminUser.id,
    );

    await this.auditLogsService.record({
      organizationId: organization.id,
      userId: adminUser.id,
      entityType: 'Organization',
      entityId: organization.id,
      action: AuditAction.CREATE,
      changes: {
        name: organization.name,
        planType: organization.planType,
        licenseKey: license.key,
      },
    });

    const tokens = await this.generateTokens(adminUser);
    return { tokens, user: this.mapUser(adminUser) };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const passwordValid = await comparePassword(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status !== 'active') {
      throw new ForbiddenException('User account is inactive');
    }
    if (
      user.organization &&
      user.organization.status === OrganizationStatus.INACTIVE
    ) {
      throw new ForbiddenException(
        'Your organization is inactive. Please contact your administrator.',
      );
    }

    const tokens = await this.generateTokens(user);
    await this.usersService.recordLogin(user.id);
    if (user.organization?.id) {
      await this.auditLogsService.record({
        organizationId: user.organization.id,
        userId: user.id,
        entityType: 'User',
        entityId: user.id,
        action: AuditAction.LOGIN,
      });
    }
    return { tokens, user: this.mapUser(user) };
  }

  async refreshToken(dto: RefreshTokenDto): Promise<AuthTokens> {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token revoked');
    }
    const isValid = await comparePassword(
      dto.refreshToken,
      user.refreshTokenHash,
    );
    if (!isValid) {
      throw new UnauthorizedException('Refresh token invalid');
    }
    return this.generateTokens(user);
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.clearRefreshToken(userId);
  }

  private async generateTokens(user: User): Promise<AuthTokens> {
    const payload = {
      sub: user.id,
      role: user.role,
      email: user.email,
      organizationId: user.organization?.id ?? null,
    };
    const accessExpiresIn = Number(
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN_SECONDS') ?? 900,
    );
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessExpiresIn,
    });
    const refreshExpires =
      (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') as
        | string
        | undefined) ?? '7d';
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpires as any,
      },
    );
    const refreshTokenHash = await hashPassword(refreshToken);
    await this.usersService.setRefreshToken(user.id, refreshTokenHash);
    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresIn,
    };
  }

  private mapUser(user: User) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organization: user.organization
        ? {
            id: user.organization.id,
            name: user.organization.name,
          }
        : null,
    };
  }
}

