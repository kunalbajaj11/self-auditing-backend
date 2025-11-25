import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from '../../entities/plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private readonly plansRepository: Repository<Plan>,
  ) {}

  async create(dto: CreatePlanDto): Promise<Plan> {
    const plan = this.plansRepository.create({
      ...dto,
      priceMonthly:
        dto.priceMonthly !== undefined
          ? dto.priceMonthly.toFixed(2)
          : null,
      priceYearly:
        dto.priceYearly !== undefined
          ? dto.priceYearly.toFixed(2)
          : null,
    });
    return this.plansRepository.save(plan);
  }

  async findAll(): Promise<Plan[]> {
    return this.plansRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<Plan> {
    const plan = await this.plansRepository.findOne({ where: { id } });
    if (!plan) {
      throw new NotFoundException(`Plan ${id} not found`);
    }
    return plan;
  }

  async update(id: string, dto: UpdatePlanDto): Promise<Plan> {
    const plan = await this.findById(id);
    Object.assign(plan, {
      ...dto,
      priceMonthly:
        dto.priceMonthly !== undefined
          ? dto.priceMonthly.toFixed(2)
          : plan.priceMonthly,
      priceYearly:
        dto.priceYearly !== undefined
          ? dto.priceYearly.toFixed(2)
          : plan.priceYearly,
    });
    return this.plansRepository.save(plan);
  }

  async delete(id: string): Promise<void> {
    const plan = await this.findById(id);
    await this.plansRepository.remove(plan);
  }
}

