import { AccrualsService } from './accruals.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AccrualFilterDto } from './dto/accrual-filter.dto';
export declare class AccrualsController {
    private readonly accrualsService;
    constructor(accrualsService: AccrualsService);
    list(user: AuthenticatedUser, filters: AccrualFilterDto): Promise<import("../../entities/accrual.entity").Accrual[]>;
    pendingCount(user: AuthenticatedUser): Promise<{
        pending: number;
    }>;
    get(id: string, user: AuthenticatedUser): Promise<import("../../entities/accrual.entity").Accrual>;
}
