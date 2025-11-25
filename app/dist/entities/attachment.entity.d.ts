import { AbstractEntity } from './abstract.entity';
import { Expense } from './expense.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
export declare class Attachment extends AbstractEntity {
    expense: Expense;
    organization: Organization;
    fileName: string;
    fileUrl: string;
    fileKey?: string | null;
    fileType: string;
    fileSize: number;
    uploadedBy?: User | null;
}
