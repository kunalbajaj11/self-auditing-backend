import { Repository } from 'typeorm';
import { Plan } from '../../entities/plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
export declare class PlansService {
    private readonly plansRepository;
    constructor(plansRepository: Repository<Plan>);
    create(dto: CreatePlanDto): Promise<Plan>;
    findAll(): Promise<Plan[]>;
    findById(id: string): Promise<Plan>;
    update(id: string, dto: UpdatePlanDto): Promise<Plan>;
    delete(id: string): Promise<void>;
}
