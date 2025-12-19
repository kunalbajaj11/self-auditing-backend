import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../../entities/organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { ChangeOrganizationStatusDto } from './dto/change-status.dto';
import { ActivateOrganizationWithExpiryDto } from './dto/activate-with-expiry.dto';
import { Plan } from '../../entities/plan.entity';
import { OrganizationStatus } from '../../common/enums/organization-status.enum';
import { LicenseKeysService } from '../license-keys/license-keys.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { UpgradeLicenseDto } from './dto/upgrade-license.dto';
import { RegionConfigService } from '../region-config/region-config.service';
import { Region } from '../../common/enums/region.enum';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(Plan)
    private readonly plansRepository: Repository<Plan>,
    private readonly licenseKeysService: LicenseKeysService,
    private readonly auditLogsService: AuditLogsService,
    private readonly regionConfigService: RegionConfigService,
  ) {}

  private normalizeDateString(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    const existing = await this.organizationsRepository.findOne({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Organization with this name already exists');
    }

    // Get region config for defaults (defaults to UAE if not provided)
    const region = dto.region || Region.UAE;
    const regionConfig = this.regionConfigService.getConfig(region);

    // Use provided currency or default from region config
    const currency = dto.currency ?? regionConfig.defaultCurrency;
    const baseCurrency = regionConfig.baseCurrency;

    const organization = this.organizationsRepository.create({
      name: dto.name,
      vatNumber: dto.vatNumber,
      address: dto.address,
      currency: currency,
      baseCurrency: baseCurrency,
      fiscalYearStart: this.normalizeDateString(dto.fiscalYearStart),
      planType: dto.planType,
      contactPerson: dto.contactPerson,
      contactEmail: dto.contactEmail,
      storageQuotaMb: dto.storageQuotaMb ?? 500,
      status: OrganizationStatus.ACTIVE,
      region: region,
    });

    if (dto.planId) {
      const plan = await this.plansRepository.findOne({
        where: { id: dto.planId },
      });
      if (!plan) {
        throw new NotFoundException('Plan not found');
      }
      organization.plan = plan;
    }

    return this.organizationsRepository.save(organization);
  }

  async findAll(): Promise<Organization[]> {
    return this.organizationsRepository.find({
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<Organization> {
    const organization = await this.organizationsRepository.findOne({
      where: { id },
      relations: ['plan'],
    });
    if (!organization) {
      throw new NotFoundException(`Organization ${id} not found`);
    }
    return organization;
  }

  async update(id: string, dto: UpdateOrganizationDto): Promise<Organization> {
    const organization = await this.findById(id);
    if (dto.name && dto.name !== organization.name) {
      const exists = await this.organizationsRepository.findOne({
        where: { name: dto.name },
      });
      if (exists && exists.id !== id) {
        throw new ConflictException('Organization name already in use');
      }
      organization.name = dto.name;
    }

    if (dto.vatNumber !== undefined) {
      organization.vatNumber = dto.vatNumber;
    }
    if (dto.address !== undefined) {
      organization.address = dto.address;
    }
    if (dto.currency !== undefined) {
      organization.currency = dto.currency;
    }
    if (dto.fiscalYearStart !== undefined) {
      organization.fiscalYearStart = this.normalizeDateString(
        dto.fiscalYearStart,
      );
    }
    if (dto.planType !== undefined) {
      organization.planType = dto.planType;
    }
    if (dto.contactPerson !== undefined) {
      organization.contactPerson = dto.contactPerson;
    }
    if (dto.contactEmail !== undefined) {
      organization.contactEmail = dto.contactEmail;
    }
    if (dto.storageQuotaMb !== undefined) {
      organization.storageQuotaMb = dto.storageQuotaMb;
    }
    if (dto.region !== undefined) {
      organization.region = dto.region;
    }
    if (dto.planId !== undefined) {
      if (dto.planId === null) {
        organization.plan = null;
      } else {
        const plan = await this.plansRepository.findOne({
          where: { id: dto.planId },
        });
        if (!plan) {
          throw new NotFoundException('Plan not found');
        }
        organization.plan = plan;
      }
    }

    return this.organizationsRepository.save(organization);
  }

  async changeStatus(
    id: string,
    dto: ChangeOrganizationStatusDto,
  ): Promise<Organization> {
    const organization = await this.findById(id);
    organization.status = dto.status;
    return this.organizationsRepository.save(organization);
  }

  async activateWithExpiry(
    id: string,
    dto: ActivateOrganizationWithExpiryDto,
  ): Promise<Organization> {
    const organization = await this.findById(id);
    const expiryDate = new Date(dto.expiryDate);

    // Renew the license key with the new expiry date
    await this.licenseKeysService.findAndRenewByOrganizationId(id, expiryDate);

    // Activate the organization
    organization.status = OrganizationStatus.ACTIVE;
    return this.organizationsRepository.save(organization);
  }

  async upgradeLicense(
    organizationId: string,
    userId: string,
    dto: UpgradeLicenseDto,
  ): Promise<Organization> {
    const organization = await this.findById(organizationId);

    // Get current license to track the upgrade
    const currentLicense =
      await this.licenseKeysService.findByOrganizationId(organizationId);

    // Validate the new license key for upgrade
    const newLicense = await this.licenseKeysService.validateForUpgrade(
      dto.licenseKey.trim(),
      organization.planType,
    );

    const oldPlanType = organization.planType;
    const newPlanType = newLicense.planType ?? organization.planType;

    // Update organization with new plan type
    organization.planType = newPlanType;

    // Update storage quota if the new license has one
    if (
      newLicense.storageQuotaMb !== null &&
      newLicense.storageQuotaMb !== undefined
    ) {
      organization.storageQuotaMb = newLicense.storageQuotaMb;
    }

    // Save organization first
    const updatedOrganization =
      await this.organizationsRepository.save(organization);

    // Mark the new license as consumed and link it to the organization
    await this.licenseKeysService.markAsConsumed(
      newLicense.id,
      organizationId,
      userId,
    );

    // Record audit log for the upgrade
    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'Organization',
      entityId: organizationId,
      action: AuditAction.UPDATE,
      changes: {
        planType: {
          from: oldPlanType,
          to: newPlanType,
        },
        licenseKey: {
          old: currentLicense?.key ?? 'none',
          new: newLicense.key,
        },
        storageQuotaMb: newLicense.storageQuotaMb
          ? {
              from: organization.storageQuotaMb,
              to: newLicense.storageQuotaMb,
            }
          : undefined,
      },
    });

    return updatedOrganization;
  }
}
