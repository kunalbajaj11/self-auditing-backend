import { Repository } from 'typeorm';
import { Accrual } from '../../entities/accrual.entity';
import { AccrualFilterDto } from './dto/accrual-filter.dto';
export declare class AccrualsService {
    private readonly accrualsRepository;
    constructor(accrualsRepository: Repository<Accrual>);
    findAll(organizationId: string, filters: AccrualFilterDto): Promise<Accrual[]>;
    findById(organizationId: string, id: string): Promise<Accrual>;
    pendingCount(organizationId: string): Promise<number>;
}
