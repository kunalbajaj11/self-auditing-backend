import { AccrualStatus } from '../../../common/enums/accrual-status.enum';
export declare class AccrualFilterDto {
    status?: AccrualStatus;
    startDate?: string;
    endDate?: string;
}
