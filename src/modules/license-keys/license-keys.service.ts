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
import { CreateLicenseKeyDto } from './dto/create-license-key.dto';
import { RenewLicenseKeyDto } from './dto/renew-license-key.dto';
import { LicenseKeyStatus } from '../../common/enums/license-key-status.enum';
import { PlanType } from '../../common/enums/plan-type.enum';

@Injectable()
export class LicenseKeysService {
  constructor(
    @InjectRepository(LicenseKey)
    private readonly licenseKeysRepository: Repository<LicenseKey>,
  ) {}

  async create(
    dto: CreateLicenseKeyDto,
    createdById: string,
  ): Promise<LicenseKey> {
    const key = this.generateUniqueKey();
    const now = new Date();
    const validityDays = dto.validityDays ?? 365;
    const expiresAt = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

    const license = this.licenseKeysRepository.create({
      key,
      status: LicenseKeyStatus.ACTIVE,
      planType: dto.planType ?? null,
      maxUsers: dto.maxUsers ?? null,
      storageQuotaMb: dto.storageQuotaMb ?? null,
      expiresAt,
      notes: dto.notes ?? null,
      createdById,
    });
    return this.licenseKeysRepository.save(license);
  }

  async findAll(): Promise<LicenseKey[]> {
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
    return licenses;
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

  async findByOrganizationId(organizationId: string): Promise<LicenseKey | null> {
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
      [PlanType.ENTERPRISE]: 2,
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

  private generateUniqueKey(): string {
    return randomBytes(16).toString('hex').toUpperCase();
  }
}

