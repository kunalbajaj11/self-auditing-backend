import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { ReportType } from '../common/enums/report-type.enum';
import { User } from './user.entity';
export declare class Report extends AbstractEntity {
    organization: Organization;
    type: ReportType;
    filters?: Record<string, any> | null;
    fileUrl?: string | null;
    generatedBy?: User | null;
}
