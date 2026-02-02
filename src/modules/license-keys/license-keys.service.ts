import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { LicenseKey } from '../../entities/license-key.entity';
import { Attachment } from '../../entities/attachment.entity';
import { Organization } from '../../entities/organization.entity';
import { CreateLicenseKeyDto } from './dto/create-license-key.dto';
import { RenewLicenseKeyDto } from './dto/renew-license-key.dto';
import { UpdateLicenseFeaturesDto } from './dto/update-license-features.dto';
import { LicenseKeyStatus } from '../../common/enums/license-key-status.enum';
import { PlanType } from '../../common/enums/plan-type.enum';
import { EmailService } from '../notifications/email.service';

@Injectable()
export class LicenseKeysService {
  constructor(
    @InjectRepository(LicenseKey)
    private readonly licenseKeysRepository: Repository<LicenseKey>,
    @InjectRepository(Attachment)
    private readonly attachmentsRepository: Repository<Attachment>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    private readonly emailService: EmailService,
  ) {}

  async create(
    dto: CreateLicenseKeyDto,
    createdById: string,
  ): Promise<LicenseKey> {
    const key = this.generateUniqueKey();
    const now = new Date();
    const validityDays = dto.validityDays ?? 365;
    const expiresAt = new Date(
      now.getTime() + validityDays * 24 * 60 * 60 * 1000,
    );

    const license = this.licenseKeysRepository.create({
      key,
      status: LicenseKeyStatus.ACTIVE,
      planType: dto.planType ?? null,
      maxUsers: dto.maxUsers ?? null,
      storageQuotaMb: dto.storageQuotaMb ?? null,
      maxUploads: dto.maxUploads ?? 2000,
      allocatedUploads: 0,
      expiresAt,
      notes: dto.notes ?? null,
      email: dto.email ?? null,
      region: dto.region ?? null,
      enablePayroll: false, // Default to disabled
      enableInventory: false, // Default to disabled
      createdById,
    });
    const savedLicense = await this.licenseKeysRepository.save(license);

    // Send email with license key
    if (dto.email) {
      try {
        const planTypeText = dto.planType
          ? dto.planType.toUpperCase()
          : 'Custom';
        const validityText =
          validityDays === 365 ? '1 year' : `${validityDays} days`;
        const maxUsersText = dto.maxUsers ? `Max Users: ${dto.maxUsers}` : '';
        const storageText = dto.storageQuotaMb
          ? `Storage Quota: ${dto.storageQuotaMb} MB`
          : '';

        const emailSubject = 'Your License Key - SelfAccounting.AI';
        const emailHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #f9f9f9; }
                .license-key { background-color: #fff; border: 2px solid #1976d2; padding: 15px; margin: 20px 0; text-align: center; font-family: monospace; font-size: 18px; font-weight: bold; color: #1976d2; }
                .details { background-color: #fff; padding: 15px; margin: 10px 0; border-left: 4px solid #1976d2; }
                .button { display: inline-block; padding: 12px 24px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; font-weight: bold; }
                .button:hover { background-color: #1565c0; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>SelfAccounting.AI</h1>
                </div>
                <div class="content">
                  <h2>Your License Key</h2>
                  <p>Your license key has been generated successfully. Please use this key to register your organization.</p>
                  
                  <div class="license-key">${savedLicense.key}</div>
                  
                  <div class="details">
                    <h3>License Details:</h3>
                    <p><strong>Plan Type:</strong> ${planTypeText}</p>
                    <p><strong>Validity:</strong> ${validityText}</p>
                    ${maxUsersText ? `<p><strong>${maxUsersText}</strong></p>` : ''}
                    ${storageText ? `<p><strong>${storageText}</strong></p>` : ''}
                    <p><strong>Expires At:</strong> ${expiresAt.toLocaleDateString()}</p>
                  </div>
                  
                  ${dto.notes ? `<p><strong>Notes:</strong> ${dto.notes}</p>` : ''}
                  
                  <p>Please keep this license key secure and use it during the registration process.</p>
                  
                  <p style="text-align: center; margin: 30px 0;">
                    <a href="https://selfaccounting.ai/auth/login" class="button">Login to SelfAccounting.AI</a>
                  </p>
                  
                  <p>Once you have registered, you can use the login link above to access your account.</p>
                </div>
                <div class="footer">
                  <p>This is an automated notification from SelfAccounting.AI.</p>
                </div>
              </div>
            </body>
          </html>
        `;

        await this.emailService.sendEmail({
          to: dto.email,
          subject: emailSubject,
          html: emailHtml,
          text: `Your License Key: ${savedLicense.key}\n\nPlan Type: ${planTypeText}\nValidity: ${validityText}\nExpires At: ${expiresAt.toLocaleDateString()}\n\n${dto.notes ? `Notes: ${dto.notes}\n\n` : ''}Please keep this license key secure and use it during the registration process.\n\nLogin to your account: https://selfaccounting.ai/auth/login\n\nOnce you have registered, you can use the login link above to access your account.`,
        });
      } catch (error) {
        // Log error but don't fail license creation
        console.error('Failed to send license key email:', error);
      }
    }

    // Send notification to super admin about new license creation
    try {
      await this.emailService.sendNewLicenseCreationNotificationToSuperAdmin({
        key: savedLicense.key,
        planType: dto.planType ?? undefined,
        maxUsers: dto.maxUsers ?? undefined,
        storageQuotaMb: dto.storageQuotaMb ?? undefined,
        maxUploads: dto.maxUploads ?? undefined,
        notes: dto.notes ?? undefined,
        region: dto.region ?? undefined,
        validityDays: dto.validityDays ?? undefined,
        email: dto.email,
        expiresAt: savedLicense.expiresAt,
        createdAt: savedLicense.createdAt ?? new Date(),
        createdById,
      });
    } catch (error) {
      console.error(
        'Failed to send super admin license creation notification:',
        error,
      );
    }

    return savedLicense;
  }

  async findAll(): Promise<
    (LicenseKey & { organizationName?: string | null })[]
  > {
    const licenses = await this.licenseKeysRepository.find({
      order: { createdAt: 'DESC' },
    });
    const now = new Date();
    const toUpdate: LicenseKey[] = [];
    licenses.forEach((license) => {
      if (
        license.status === LicenseKeyStatus.ACTIVE &&
        license.expiresAt.getTime() < now.getTime()
      ) {
        license.status = LicenseKeyStatus.EXPIRED;
        toUpdate.push(license);
      }
    });
    if (toUpdate.length > 0) {
      await this.licenseKeysRepository.save(toUpdate);
    }

    // Fetch organization names for consumed licenses
    const licensesWithOrgNames = await Promise.all(
      licenses.map(async (license) => {
        if (license.consumedByOrganizationId) {
          const organization = await this.organizationsRepository.findOne({
            where: { id: license.consumedByOrganizationId },
            select: ['name'],
          });
          return {
            ...license,
            organizationName: organization?.name ?? null,
          };
        }
        return {
          ...license,
          organizationName: null,
        };
      }),
    );

    return licensesWithOrgNames;
  }

  async renew(id: string, dto: RenewLicenseKeyDto): Promise<LicenseKey> {
    const license = await this.licenseKeysRepository.findOne({ where: { id } });
    if (!license) {
      throw new NotFoundException('License key not found');
    }
    if (license.status === LicenseKeyStatus.REVOKED) {
      throw new BadRequestException('Revoked licenses cannot be renewed');
    }

    let newExpiry: Date | null = null;
    if (dto.newExpiry) {
      newExpiry = new Date(dto.newExpiry);
    } else if (dto.extendByDays) {
      newExpiry = new Date(
        license.expiresAt.getTime() + dto.extendByDays * 24 * 60 * 60 * 1000,
      );
    } else {
      newExpiry = new Date(
        license.expiresAt.getTime() + 365 * 24 * 60 * 60 * 1000,
      );
    }
    license.expiresAt = newExpiry;
    if (license.status === LicenseKeyStatus.EXPIRED) {
      license.status =
        license.consumedAt != null
          ? LicenseKeyStatus.CONSUMED
          : LicenseKeyStatus.ACTIVE;
    }
    return this.licenseKeysRepository.save(license);
  }

  async revoke(id: string): Promise<LicenseKey> {
    const license = await this.licenseKeysRepository.findOne({ where: { id } });
    if (!license) {
      throw new NotFoundException('License key not found');
    }
    license.status = LicenseKeyStatus.REVOKED;
    return this.licenseKeysRepository.save(license);
  }

  async validateForRegistration(licenseKeyValue: string): Promise<LicenseKey> {
    const license = await this.licenseKeysRepository.findOne({
      where: { key: licenseKeyValue },
    });
    if (!license) {
      throw new UnauthorizedException('Invalid license key');
    }
    if (license.status === LicenseKeyStatus.REVOKED) {
      throw new UnauthorizedException('License key revoked');
    }
    if (license.status === LicenseKeyStatus.CONSUMED) {
      throw new UnauthorizedException('License key already used');
    }
    const now = new Date();
    if (license.expiresAt.getTime() < now.getTime()) {
      license.status = LicenseKeyStatus.EXPIRED;
      await this.licenseKeysRepository.save(license);
      throw new UnauthorizedException('License key expired');
    }
    return license;
  }

  async markAsConsumed(
    licenseId: string,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const license = await this.licenseKeysRepository.findOne({
      where: { id: licenseId },
    });
    if (!license) {
      throw new NotFoundException('License key not found');
    }
    license.status = LicenseKeyStatus.CONSUMED;
    license.consumedAt = new Date();
    license.consumedByOrganizationId = organizationId;
    license.consumedByUserId = userId;
    await this.licenseKeysRepository.save(license);
  }

  async findAndRenewByOrganizationId(
    organizationId: string,
    expiryDate: Date,
  ): Promise<LicenseKey> {
    const license = await this.licenseKeysRepository.findOne({
      where: { consumedByOrganizationId: organizationId },
    });
    if (!license) {
      throw new NotFoundException(
        'License key not found for this organization',
      );
    }
    license.expiresAt = expiryDate;
    if (license.status === LicenseKeyStatus.EXPIRED) {
      license.status = LicenseKeyStatus.CONSUMED;
    }
    return this.licenseKeysRepository.save(license);
  }

  async findByOrganizationId(
    organizationId: string,
  ): Promise<LicenseKey | null> {
    return this.licenseKeysRepository.findOne({
      where: { consumedByOrganizationId: organizationId },
    });
  }

  async validateForUpgrade(
    licenseKeyValue: string,
    currentPlanType: PlanType,
  ): Promise<LicenseKey> {
    const license = await this.validateForRegistration(licenseKeyValue);

    // Check if the new license is for a higher tier
    const planHierarchy: Record<PlanType, number> = {
      [PlanType.FREE]: 0,
      [PlanType.STANDARD]: 1,
      [PlanType.PREMIUM]: 2,
      [PlanType.ENTERPRISE]: 3,
    };

    const newPlanType = license.planType ?? PlanType.FREE;
    const currentTier = planHierarchy[currentPlanType] ?? 0;
    const newTier = planHierarchy[newPlanType] ?? 0;

    if (newTier <= currentTier) {
      throw new BadRequestException(
        `The license key is for ${newPlanType} plan, which is not higher than your current ${currentPlanType} plan. Please use a license key for a higher tier.`,
      );
    }

    return license;
  }

  async allocateUploads(
    licenseId: string,
    additionalUploads: number,
  ): Promise<LicenseKey> {
    if (additionalUploads < 0) {
      throw new BadRequestException('Additional uploads must be non-negative');
    }
    const license = await this.licenseKeysRepository.findOne({
      where: { id: licenseId },
    });
    if (!license) {
      throw new NotFoundException('License key not found');
    }
    license.allocatedUploads =
      (license.allocatedUploads || 0) + additionalUploads;
    return this.licenseKeysRepository.save(license);
  }

  async getUploadUsage(organizationId: string): Promise<{
    maxUploads: number;
    allocatedUploads: number;
    totalAllowed: number;
    usedUploads: number;
    remainingUploads: number;
  }> {
    const license = await this.findByOrganizationId(organizationId);
    if (!license) {
      throw new NotFoundException(
        'License key not found for this organization',
      );
    }

    // Count attachments for this organization
    const usedUploads = await this.attachmentsRepository.count({
      where: { organization: { id: organizationId } },
    });

    const maxUploads = license.maxUploads || 2000;
    const allocatedUploads = license.allocatedUploads || 0;
    const totalAllowed = maxUploads + allocatedUploads;
    const remainingUploads = Math.max(0, totalAllowed - usedUploads);

    return {
      maxUploads,
      allocatedUploads,
      totalAllowed,
      usedUploads,
      remainingUploads,
    };
  }

  async checkUploadLimit(
    organizationId: string,
    newUploadsCount: number,
  ): Promise<{ allowed: boolean; remaining: number; totalAllowed: number }> {
    const usage = await this.getUploadUsage(organizationId);
    const allowed = usage.remainingUploads >= newUploadsCount;
    return {
      allowed,
      remaining: usage.remainingUploads,
      totalAllowed: usage.totalAllowed,
    };
  }

  async updateFeatures(
    id: string,
    dto: { enablePayroll?: boolean; enableInventory?: boolean },
  ): Promise<LicenseKey> {
    const license = await this.licenseKeysRepository.findOne({ where: { id } });
    if (!license) {
      throw new NotFoundException('License key not found');
    }

    if (dto.enablePayroll !== undefined) {
      license.enablePayroll = dto.enablePayroll;
    }
    if (dto.enableInventory !== undefined) {
      license.enableInventory = dto.enableInventory;
    }

    return this.licenseKeysRepository.save(license);
  }

  async isFeatureEnabled(
    organizationId: string,
    feature: 'payroll' | 'inventory',
  ): Promise<boolean> {
    // Check organization's direct feature flags (not license key)
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
      select: ['enablePayroll', 'enableInventory'],
    });

    if (!organization) {
      return false;
    }

    if (feature === 'payroll') {
      return organization.enablePayroll ?? false;
    }
    if (feature === 'inventory') {
      return organization.enableInventory ?? false;
    }

    return false;
  }

  /**
   * Link an existing license key to an organization
   * Useful when organization was created without a license key
   */
  async linkLicenseToOrganization(
    licenseId: string,
    organizationId: string,
    userId: string,
  ): Promise<LicenseKey> {
    const license = await this.licenseKeysRepository.findOne({
      where: { id: licenseId },
    });
    if (!license) {
      throw new NotFoundException('License key not found');
    }

    // Check if license is already consumed by another organization
    if (
      license.consumedByOrganizationId &&
      license.consumedByOrganizationId !== organizationId
    ) {
      throw new BadRequestException(
        'License key is already linked to another organization',
      );
    }

    // Link the license to the organization
    license.status = LicenseKeyStatus.CONSUMED;
    if (!license.consumedAt) {
      license.consumedAt = new Date();
    }
    license.consumedByOrganizationId = organizationId;
    if (!license.consumedByUserId) {
      license.consumedByUserId = userId;
    }

    return this.licenseKeysRepository.save(license);
  }

  private generateUniqueKey(): string {
    return randomBytes(16).toString('hex').toUpperCase();
  }
}
