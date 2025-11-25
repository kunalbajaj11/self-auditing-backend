import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Accrual } from '../../entities/accrual.entity';
import { AccrualFilterDto } from './dto/accrual-filter.dto';
import { AccrualStatus } from '../../common/enums/accrual-status.enum';

@Injectable()
export class AccrualsService {
  constructor(
    @InjectRepository(Accrual)
    private readonly accrualsRepository: Repository<Accrual>,
  ) {}

  async findAll(
    organizationId: string,
    filters: AccrualFilterDto,
  ): Promise<Accrual[]> {
    const query = this.accrualsRepository
      .createQueryBuilder('accrual')
      .leftJoinAndSelect('accrual.expense', 'expense')
      .leftJoinAndSelect('accrual.settlementExpense', 'settlementExpense')
      .where('accrual.organization_id = :organizationId', { organizationId });

    if (filters.status) {
      query.andWhere('accrual.status = :status', { status: filters.status });
    }
    if (filters.startDate) {
      query.andWhere('accrual.expected_payment_date >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters.endDate) {
      query.andWhere('accrual.expected_payment_date <= :endDate', {
        endDate: filters.endDate,
      });
    }
    query.orderBy('accrual.expected_payment_date', 'ASC');
    return query.getMany();
  }

  async findById(organizationId: string, id: string): Promise<Accrual> {
    const accrual = await this.accrualsRepository.findOne({
      where: { id, organization: { id: organizationId } },
      relations: ['expense', 'settlementExpense'],
    });
    if (!accrual) {
      throw new NotFoundException('Accrual not found');
    }
    return accrual;
  }

  async pendingCount(organizationId: string): Promise<number> {
    return this.accrualsRepository.count({
      where: {
        organization: { id: organizationId },
        status: AccrualStatus.PENDING_SETTLEMENT,
      },
    });
  }
}

