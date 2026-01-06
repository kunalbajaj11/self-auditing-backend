import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ComplianceDeadline,
  ComplianceType,
  FilingFrequency,
  DeadlineStatus,
} from '../../entities/compliance-deadline.entity';
import { Organization } from '../../entities/organization.entity';
import { Region } from '../../common/enums/region.enum';

export interface ComplianceDeadlineDto {
  complianceType: ComplianceType;
  period: string;
  dueDate: Date;
  filingFrequency: FilingFrequency;
  region?: Region;
}

@Injectable()
export class ComplianceCalendarService {
  private readonly logger = new Logger(ComplianceCalendarService.name);

  constructor(
    @InjectRepository(ComplianceDeadline)
    private readonly deadlinesRepository: Repository<ComplianceDeadline>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
  ) {}

  /**
   * Get compliance deadlines for organization
   */
  async getDeadlines(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
    complianceType?: ComplianceType,
  ): Promise<ComplianceDeadline[]> {
    const query = this.deadlinesRepository
      .createQueryBuilder('deadline')
      .where('deadline.organization_id = :organizationId', { organizationId })
      .orderBy('deadline.due_date', 'ASC');

    if (startDate) {
      query.andWhere('deadline.due_date >= :startDate', { startDate });
    }

    if (endDate) {
      query.andWhere('deadline.due_date <= :endDate', { endDate });
    }

    if (complianceType) {
      query.andWhere('deadline.compliance_type = :complianceType', {
        complianceType,
      });
    }

    return query.getMany();
  }

  /**
   * Get upcoming deadlines (next N days)
   */
  async getUpcomingDeadlines(
    organizationId: string,
    days: number = 30,
  ): Promise<ComplianceDeadline[]> {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + days);

    return this.getDeadlines(organizationId, today, futureDate);
  }

  /**
   * Get overdue deadlines
   */
  async getOverdueDeadlines(
    organizationId: string,
  ): Promise<ComplianceDeadline[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.deadlinesRepository
      .createQueryBuilder('deadline')
      .where('deadline.organization_id = :organizationId', { organizationId })
      .andWhere('deadline.due_date < :today', { today })
      .andWhere('deadline.status != :filed', { filed: DeadlineStatus.FILED })
      .orderBy('deadline.due_date', 'ASC')
      .getMany();
  }

  /**
   * Create compliance deadline
   */
  async createDeadline(
    organizationId: string,
    dto: ComplianceDeadlineDto,
  ): Promise<ComplianceDeadline> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    // Check if deadline already exists
    const existing = await this.deadlinesRepository.findOne({
      where: {
        organization: { id: organizationId },
        complianceType: dto.complianceType,
        period: dto.period,
        isDeleted: false,
      },
    });

    if (existing) {
      // Update existing
      existing.dueDate = dto.dueDate;
      existing.filingFrequency = dto.filingFrequency;
      return this.deadlinesRepository.save(existing);
    }

    // Determine status based on due date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(dto.dueDate);
    dueDate.setHours(0, 0, 0, 0);

    let status = DeadlineStatus.PENDING;
    if (dueDate < today) {
      status = DeadlineStatus.OVERDUE;
    } else if (dueDate.getTime() === today.getTime()) {
      status = DeadlineStatus.DUE_TODAY;
    } else {
      const daysUntilDue = Math.ceil(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysUntilDue <= 7) {
        status = DeadlineStatus.UPCOMING;
      }
    }

    const deadline = this.deadlinesRepository.create({
      organization,
      complianceType: dto.complianceType,
      region: dto.region || (organization.region as Region),
      period: dto.period,
      dueDate: dto.dueDate,
      filingFrequency: dto.filingFrequency,
      status,
    });

    return this.deadlinesRepository.save(deadline);
  }

  /**
   * Update deadline status
   */
  async updateDeadlineStatus(
    id: string,
    organizationId: string,
    status: DeadlineStatus,
    filingReference?: string,
  ): Promise<ComplianceDeadline> {
    const deadline = await this.deadlinesRepository.findOne({
      where: {
        id,
        organization: { id: organizationId },
        isDeleted: false,
      },
    });

    if (!deadline) {
      throw new Error('Deadline not found');
    }

    deadline.status = status;
    if (filingReference) {
      deadline.filingReference = filingReference;
    }
    if (status === DeadlineStatus.FILED) {
      deadline.filedAt = new Date();
    }

    return this.deadlinesRepository.save(deadline);
  }

  /**
   * Generate compliance deadlines for a period (auto-generate based on frequency)
   */
  async generateDeadlinesForPeriod(
    organizationId: string,
    complianceType: ComplianceType,
    startDate: Date,
    endDate: Date,
    filingFrequency: FilingFrequency,
  ): Promise<ComplianceDeadline[]> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    const deadlines: ComplianceDeadline[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      let period: string;
      let dueDate: Date;

      if (filingFrequency === FilingFrequency.MONTHLY) {
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        period = `${currentDate.getFullYear()}-${month}`;
        // Due date is typically end of next month (e.g., January return due end of February)
        dueDate = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth() + 2,
          0,
        );
      } else if (filingFrequency === FilingFrequency.QUARTERLY) {
        const quarter = Math.floor(currentDate.getMonth() / 3) + 1;
        period = `${currentDate.getFullYear()}-Q${quarter}`;
        // Due date is end of month after quarter ends
        dueDate = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth() + 4,
          0,
        );
      } else if (filingFrequency === FilingFrequency.ANNUAL) {
        period = String(currentDate.getFullYear());
        // Due date is typically end of next year
        dueDate = new Date(currentDate.getFullYear() + 1, 11, 31);
      } else {
        break; // Ad-hoc, don't auto-generate
      }

      const deadline = await this.createDeadline(organizationId, {
        complianceType,
        period,
        dueDate,
        filingFrequency,
        region: organization.region as Region,
      });

      deadlines.push(deadline);

      // Move to next period
      if (filingFrequency === FilingFrequency.MONTHLY) {
        currentDate.setMonth(currentDate.getMonth() + 1);
      } else if (filingFrequency === FilingFrequency.QUARTERLY) {
        currentDate.setMonth(currentDate.getMonth() + 3);
      } else if (filingFrequency === FilingFrequency.ANNUAL) {
        currentDate.setFullYear(currentDate.getFullYear() + 1);
      }
    }

    return deadlines;
  }

  /**
   * Get deadlines that need reminders
   */
  async getDeadlinesNeedingReminders(
    organizationId: string,
  ): Promise<{
    due30d: ComplianceDeadline[];
    due15d: ComplianceDeadline[];
    due7d: ComplianceDeadline[];
    due1d: ComplianceDeadline[];
    dueToday: ComplianceDeadline[];
    overdue: ComplianceDeadline[];
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const deadlines = await this.getUpcomingDeadlines(organizationId, 31);

    const due30d: ComplianceDeadline[] = [];
    const due15d: ComplianceDeadline[] = [];
    const due7d: ComplianceDeadline[] = [];
    const due1d: ComplianceDeadline[] = [];
    const dueToday: ComplianceDeadline[] = [];
    const overdue: ComplianceDeadline[] = [];

    for (const deadline of deadlines) {
      if (deadline.status === DeadlineStatus.FILED) continue;

      const dueDate = new Date(deadline.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const daysUntilDue = Math.ceil(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysUntilDue < 0) {
        if (!deadline.reminderSentOverdue) {
          overdue.push(deadline);
        }
      } else if (daysUntilDue === 0) {
        if (!deadline.reminderSentDue) {
          dueToday.push(deadline);
        }
      } else if (daysUntilDue === 1 && !deadline.reminderSent1d) {
        due1d.push(deadline);
      } else if (daysUntilDue === 7 && !deadline.reminderSent7d) {
        due7d.push(deadline);
      } else if (daysUntilDue === 15 && !deadline.reminderSent15d) {
        due15d.push(deadline);
      } else if (daysUntilDue === 30 && !deadline.reminderSent30d) {
        due30d.push(deadline);
      }
    }

    return { due30d, due15d, due7d, due1d, dueToday, overdue };
  }
}

