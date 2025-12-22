import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Organization } from '../../entities/organization.entity';
import { Expense } from '../../entities/expense.entity';
import { User } from '../../entities/user.entity';
import { Attachment } from '../../entities/attachment.entity';
import { Accrual } from '../../entities/accrual.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { AccrualStatus } from '../../common/enums/accrual-status.enum';
import { OrganizationStatus } from '../../common/enums/organization-status.enum';
import { LicenseKeysService } from '../license-keys/license-keys.service';

// Cache TTL: 5 minutes (300000 ms)
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheItem<T> {
  data: T;
  timestamp: number;
}

export interface DashboardMetrics {
  totalOrganizations: number;
  activeOrganizations: number;
  inactiveOrganizations: number;
  totalUsers: number;
  totalExpensesProcessed: number;
  totalAccruals: number;
  pendingAccruals: number;
  storageUsedMb: number;
  latestAuditLogs: Array<{
    id: string;
    organizationId: string;
    entityType: string;
    action: string;
    timestamp: string;
  }>;
}

export interface OrganizationUsageItem {
  id: string;
  name: string;
  planType: string;
  status: string;
  userCount: number;
  expenseCount: number;
  accrualCount: number;
  storageUsedMb: number;
  rankingScore: number; // Combined score for sorting
  createdAt: Date;
  licenseExpiresAt?: Date | null;
}

@Injectable()
export class SuperAdminService {
  private dashboardMetricsCache: CacheItem<DashboardMetrics> | null = null;
  private organizationUsageCache: CacheItem<OrganizationUsageItem[]> | null =
    null;

  constructor(
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Attachment)
    private readonly attachmentsRepository: Repository<Attachment>,
    @InjectRepository(Accrual)
    private readonly accrualsRepository: Repository<Accrual>,
    @InjectRepository(AuditLog)
    private readonly auditLogsRepository: Repository<AuditLog>,
    private readonly licenseKeysService: LicenseKeysService,
  ) {}

  private isCacheValid<T>(cache: CacheItem<T> | null): boolean {
    if (!cache) return false;
    return Date.now() - cache.timestamp < CACHE_TTL_MS;
  }

  async getDashboardMetrics(forceRefresh = false): Promise<DashboardMetrics> {
    // Check cache first
    if (!forceRefresh && this.isCacheValid(this.dashboardMetricsCache)) {
      return this.dashboardMetricsCache!.data;
    }

    const [
      totalOrganizations,
      activeOrganizations,
      totalUsers,
      totalExpensesProcessed,
      totalAccruals,
      pendingAccruals,
      attachmentsSum,
      latestAuditLogs,
    ] = await Promise.all([
      this.organizationsRepository.count(),
      this.organizationsRepository.count({
        where: { status: OrganizationStatus.ACTIVE },
      }),
      this.usersRepository.count({
        where: { isDeleted: false },
      }),
      this.expensesRepository.count({
        where: {
          isDeleted: false,
        },
      }),
      this.accrualsRepository.count({
        where: { isDeleted: false },
      }),
      this.accrualsRepository.count({
        where: {
          status: AccrualStatus.PENDING_SETTLEMENT,
          isDeleted: false,
        },
      }),
      this.getTotalAttachmentSize(),
      this.getLatestAuditLogs(10),
    ]);

    const inactiveOrganizations = totalOrganizations - activeOrganizations;

    const metrics: DashboardMetrics = {
      totalOrganizations,
      activeOrganizations,
      inactiveOrganizations,
      totalUsers,
      totalExpensesProcessed,
      totalAccruals,
      pendingAccruals,
      storageUsedMb: attachmentsSum,
      latestAuditLogs: latestAuditLogs.map((log) => ({
        id: log.id,
        organizationId: log.organization?.id ?? 'global',
        entityType: log.entityType,
        action: log.action,
        timestamp: log.timestamp.toISOString(),
      })),
    };

    // Cache the result
    this.dashboardMetricsCache = {
      data: metrics,
      timestamp: Date.now(),
    };

    return metrics;
  }

  async getOrganizationUsage(
    forceRefresh = false,
  ): Promise<OrganizationUsageItem[]> {
    // Check cache first
    if (!forceRefresh && this.isCacheValid(this.organizationUsageCache)) {
      return this.organizationUsageCache!.data;
    }

    const organizations = await this.organizationsRepository.find({
      order: { createdAt: 'DESC' },
    });

    const usage = await Promise.all(
      organizations.map(async (organization) => {
        const [userCount, expenseCount, accrualCount, storageMb, license] =
          await Promise.all([
            this.usersRepository.count({
              where: {
                organization: { id: organization.id },
                isDeleted: false,
              },
            }),
            this.expensesRepository.count({
              where: {
                organization: { id: organization.id },
                isDeleted: false,
              },
            }),
            this.accrualsRepository.count({
              where: {
                organization: { id: organization.id },
                isDeleted: false,
              },
            }),
            this.getTotalAttachmentSize(organization.id),
            this.licenseKeysService.findByOrganizationId(organization.id),
          ]);

        // Calculate ranking score: weighted combination of metrics
        // Formula: (expenseCount * 0.5) + (userCount * 0.3) + (accrualCount * 0.2)
        const rankingScore =
          expenseCount * 0.5 + userCount * 0.3 + accrualCount * 0.2;

        return {
          id: organization.id,
          name: organization.name,
          planType: organization.planType,
          status: organization.status,
          userCount,
          expenseCount,
          accrualCount,
          storageUsedMb: storageMb,
          rankingScore,
          createdAt: organization.createdAt,
          licenseExpiresAt: license?.expiresAt ?? null,
        };
      }),
    );

    // Cache the result
    this.organizationUsageCache = {
      data: usage,
      timestamp: Date.now(),
    };

    return usage;
  }

  async getLatestAuditLogs(
    limit: number = 10,
    skip: number = 0,
  ): Promise<AuditLog[]> {
    return this.auditLogsRepository.find({
      take: limit,
      skip,
      order: { timestamp: 'DESC' },
      relations: ['organization'],
      where: { isDeleted: false },
    });
  }

  private async getTotalAttachmentSize(
    organizationId?: string,
  ): Promise<number> {
    const query = this.attachmentsRepository
      .createQueryBuilder('attachment')
      .select('COALESCE(SUM(attachment.file_size), 0)', 'total')
      .andWhere('attachment.is_deleted = false');

    if (organizationId) {
      query.where('attachment.organization_id = :organizationId', {
        organizationId,
      });
    }

    const result = await query.getRawOne<{ total: string }>();
    const totalBytes = Number(result?.total ?? 0);
    // Convert bytes to MB: divide by 1024×1024
    return Number((totalBytes / (1024 * 1024)).toFixed(2));
  }
}
