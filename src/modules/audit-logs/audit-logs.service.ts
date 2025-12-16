import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../entities/audit-log.entity';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';

interface AuditLogInput {
  organizationId: string;
  userId?: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  changes?: Record<string, any>;
  ipAddress?: string;
}

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogsRepository: Repository<AuditLog>,
  ) {}

  async record(input: AuditLogInput): Promise<void> {
    const log = this.auditLogsRepository.create({
      organization: { id: input.organizationId } as any,
      user: input.userId ? ({ id: input.userId } as any) : null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      changes: input.changes ?? {},
      ipAddress: input.ipAddress ?? null,
      timestamp: new Date(),
    });
    await this.auditLogsRepository.save(log);
  }

  async listForOrganization(
    organizationId: string,
    filters: AuditLogFilterDto,
  ): Promise<AuditLog[]> {
    const query = this.auditLogsRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .where('log.organization_id = :organizationId', { organizationId });

    if (filters.entityType) {
      query.andWhere('log.entity_type = :entityType', {
        entityType: filters.entityType,
      });
    }
    if (filters.userId) {
      query.andWhere('log.user_id = :userId', { userId: filters.userId });
    }
    if (filters.startDate) {
      query.andWhere('log.timestamp >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters.endDate) {
      query.andWhere('log.timestamp <= :endDate', {
        endDate: filters.endDate,
      });
    }
    query.orderBy('log.timestamp', 'DESC');
    return query.getMany();
  }
}
