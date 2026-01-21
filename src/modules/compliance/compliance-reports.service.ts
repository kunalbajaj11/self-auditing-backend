import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ComplianceDeadline,
  ComplianceType,
} from '../../entities/compliance-deadline.entity';
import { TaxForm, TaxFormStatus } from '../../entities/tax-form.entity';
import { Organization } from '../../entities/organization.entity';
import { Region } from '../../common/enums/region.enum';

export interface ComplianceSummary {
  organization: {
    id: string;
    name: string;
    region: Region;
  };
  period: string;
  deadlines: {
    total: number;
    pending: number;
    upcoming: number;
    dueToday: number;
    overdue: number;
    filed: number;
  };
  forms: {
    total: number;
    draft: number;
    generated: number;
    filed: number;
  };
  byType: Record<
    ComplianceType,
    {
      deadlines: number;
      filed: number;
      pending: number;
      overdue: number;
    }
  >;
}

@Injectable()
export class ComplianceReportsService {
  private readonly logger = new Logger(ComplianceReportsService.name);

  constructor(
    @InjectRepository(ComplianceDeadline)
    private readonly deadlinesRepository: Repository<ComplianceDeadline>,
    @InjectRepository(TaxForm)
    private readonly taxFormsRepository: Repository<TaxForm>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
  ) {}

  /**
   * Generate compliance summary report
   */
  async generateComplianceSummary(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<ComplianceSummary> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    // Get all deadlines in period
    const query = this.deadlinesRepository
      .createQueryBuilder('deadline')
      .where('deadline.organization_id = :organizationId', { organizationId })
      .andWhere('deadline.is_deleted = false');

    if (startDate) {
      query.andWhere('deadline.due_date >= :startDate', { startDate });
    }
    if (endDate) {
      query.andWhere('deadline.due_date <= :endDate', { endDate });
    }

    const deadlines = await query.getMany();

    // Get all tax forms in period
    const formsQuery = this.taxFormsRepository
      .createQueryBuilder('form')
      .where('form.organization_id = :organizationId', { organizationId })
      .andWhere('form.is_deleted = false');

    if (startDate) {
      formsQuery.andWhere('form.generated_at >= :startDate', { startDate });
    }
    if (endDate) {
      formsQuery.andWhere('form.generated_at <= :endDate', { endDate });
    }

    const forms = await formsQuery.getMany();

    // Calculate summary
    const summary: ComplianceSummary = {
      organization: {
        id: organization.id,
        name: organization.name,
        region: organization.region as Region,
      },
      period:
        startDate && endDate
          ? `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
          : 'All time',
      deadlines: {
        total: deadlines.length,
        pending: deadlines.filter((d) => d.status === 'pending').length,
        upcoming: deadlines.filter((d) => d.status === 'upcoming').length,
        dueToday: deadlines.filter((d) => d.status === 'due_today').length,
        overdue: deadlines.filter((d) => d.status === 'overdue').length,
        filed: deadlines.filter((d) => d.status === 'filed').length,
      },
      forms: {
        total: forms.length,
        draft: forms.filter((f) => f.status === TaxFormStatus.DRAFT).length,
        generated: forms.filter((f) => f.status === TaxFormStatus.GENERATED)
          .length,
        filed: forms.filter((f) => f.status === TaxFormStatus.FILED).length,
      },
      byType: {} as any,
    };

    // Group by compliance type
    for (const type of Object.values(ComplianceType)) {
      const typeDeadlines = deadlines.filter((d) => d.complianceType === type);
      summary.byType[type] = {
        deadlines: typeDeadlines.length,
        filed: typeDeadlines.filter((d) => d.status === 'filed').length,
        pending: typeDeadlines.filter((d) => d.status === 'pending').length,
        overdue: typeDeadlines.filter((d) => d.status === 'overdue').length,
      };
    }

    return summary;
  }

  /**
   * Generate compliance calendar report
   */
  async generateComplianceCalendar(
    organizationId: string,
    year: number,
    month?: number,
  ): Promise<ComplianceDeadline[]> {
    const startDate = new Date(year, month !== undefined ? month - 1 : 0, 1);
    const endDate = new Date(year, month !== undefined ? month : 12, 0); // Last day of month/year

    return this.deadlinesRepository
      .createQueryBuilder('deadline')
      .where('deadline.organization_id = :organizationId', { organizationId })
      .andWhere('deadline.due_date >= :startDate', { startDate })
      .andWhere('deadline.due_date <= :endDate', { endDate })
      .andWhere('deadline.is_deleted = false')
      .orderBy('deadline.due_date', 'ASC')
      .getMany();
  }

  /**
   * Generate payment tracking report
   */
  async generatePaymentTrackingReport(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalPayments: number;
    totalAmount: number;
    byType: Record<ComplianceType, { count: number; amount: number }>;
    pending: number;
    paid: number;
    overdue: number;
  }> {
    // This would integrate with payment records
    // For now, return structure based on deadlines
    const deadlines = await this.deadlinesRepository
      .createQueryBuilder('deadline')
      .where('deadline.organization_id = :organizationId', { organizationId })
      .andWhere('deadline.is_deleted = false')
      .getMany();

    const result = {
      totalPayments: deadlines.length,
      totalAmount: 0, // Would sum actual payment amounts
      byType: {} as any,
      pending: deadlines.filter((d) => d.status === 'pending').length,
      paid: deadlines.filter((d) => d.status === 'filed').length,
      overdue: deadlines.filter((d) => d.status === 'overdue').length,
    };

    for (const type of Object.values(ComplianceType)) {
      const typeDeadlines = deadlines.filter((d) => d.complianceType === type);
      result.byType[type] = {
        count: typeDeadlines.length,
        amount: 0, // Would sum actual amounts
      };
    }

    return result;
  }
}
