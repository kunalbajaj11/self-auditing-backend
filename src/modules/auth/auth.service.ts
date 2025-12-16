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
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailService } from '../notifications/email.service';
import * as crypto from 'crypto';

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
    private readonly emailService: EmailService,
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

  async registerWithLicense(dto: RegisterWithLicenseDto): Promise<AuthResult> {
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
      storageQuotaMb: license.storageQuotaMb ?? dto.storageQuotaMb ?? undefined,
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

    // Send welcome email to the new admin user
    try {
      await this.emailService.sendWelcomeEmail(
        adminUser.email,
        adminUser.name,
        organization.name,
      );
    } catch (error) {
      // Log error but don't fail registration if email fails
      console.error('Failed to send welcome email:', error);
    }

    const tokens = await this.generateTokens(adminUser);
    return { tokens, user: this.mapUser(adminUser) };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const passwordValid = await comparePassword(
      dto.password,
      user.passwordHash,
    );
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

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ success: boolean }> {
    const user = await this.usersService.findByEmail(dto.email);

    // Don't reveal if user exists or not for security reasons
    // Always return success to prevent email enumeration
    if (!user) {
      return { success: true };
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour

    await this.usersService.setPasswordResetToken(
      user.id,
      resetToken,
      expiresAt,
    );

    // Build reset URL
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';
    const resetUrl = `${frontendUrl}/auth/reset-password?token=${resetToken}`;

    // Send email
    await this.emailService.sendEmail({
      to: user.email,
      subject: 'Reset Your Password - SmartExpense',
      html: this.buildPasswordResetEmailHtml(user.name, resetUrl),
      text: `Hello ${user.name},\n\nYou requested to reset your password. Please click the following link to reset your password:\n\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you did not request this, please ignore this email.\n\nBest regards,\nSmartExpense Team`,
    });

    return { success: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ success: boolean }> {
    const user = await this.usersService.findByPasswordResetToken(dto.token);

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (
      !user.passwordResetTokenExpires ||
      user.passwordResetTokenExpires < new Date()
    ) {
      throw new BadRequestException('Reset token has expired');
    }

    await this.usersService.updatePassword(user.id, dto.password);

    // Log the password reset
    if (user.organization?.id) {
      await this.auditLogsService.record({
        organizationId: user.organization.id,
        userId: user.id,
        entityType: 'User',
        entityId: user.id,
        action: AuditAction.UPDATE,
        changes: { passwordReset: true },
      });
    }

    return { success: true };
  }

  private buildPasswordResetEmailHtml(name: string, resetUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            .button { display: inline-block; padding: 12px 24px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
            .button:hover { background-color: #1565c0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>SmartExpense UAE</h1>
            </div>
            <div class="content">
              <h2>Reset Your Password</h2>
              <p>Hello ${name},</p>
              <p>You requested to reset your password. Please click the button below to reset your password:</p>
              <p style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </p>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #1976d2;">${resetUrl}</p>
              <p><strong>This link will expire in 1 hour.</strong></p>
              <p>If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>
            </div>
            <div class="footer">
              <p>This is an automated email from SmartExpense UAE.</p>
              <p>For security reasons, please do not share this link with anyone.</p>
            </div>
          </div>
        </body>
      </html>
    `;
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
