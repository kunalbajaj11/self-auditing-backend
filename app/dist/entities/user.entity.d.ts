import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { UserRole } from '../common/enums/user-role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { Expense } from './expense.entity';
import { Notification } from './notification.entity';
import { AuditLog } from './audit-log.entity';
import { Report } from './report.entity';
import { Category } from './category.entity';
import { Attachment } from './attachment.entity';
import { ExpenseType } from './expense-type.entity';
export declare class User extends AbstractEntity {
    organization?: Organization | null;
    role: UserRole;
    name: string;
    email: string;
    passwordHash: string;
    phone?: string | null;
    refreshTokenHash?: string | null;
    status: UserStatus;
    lastLogin?: Date | null;
    expenses: Expense[];
    notifications: Notification[];
    auditLogs: AuditLog[];
    generatedReports: Report[];
    createdCategories: Category[];
    createdExpenseTypes: ExpenseType[];
    attachments: Attachment[];
}
