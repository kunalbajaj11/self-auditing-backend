import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
export declare class PlansController {
    private readonly plansService;
    constructor(plansService: PlansService);
    list(): Promise<import("../../entities/plan.entity").Plan[]>;
    create(dto: CreatePlanDto): Promise<import("../../entities/plan.entity").Plan>;
    update(id: string, dto: UpdatePlanDto): Promise<import("../../entities/plan.entity").Plan>;
    delete(id: string): Promise<{
        success: boolean;
    }>;
}
