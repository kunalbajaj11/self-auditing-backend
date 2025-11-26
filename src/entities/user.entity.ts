import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
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
import { SalesInvoice } from './sales-invoice.entity';
import { CreditNote } from './credit-note.entity';

@Index('idx_users_email', ['email'], { unique: true })
@Entity({ name: 'users' })
export class User extends AbstractEntity {
  @ManyToOne(() => Organization, (organization) => organization.users, {
    nullable: true,
  })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({
    type: 'enum',
    enum: UserRole,
  })
  role: UserRole;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 150 })
  email: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({ length: 20, nullable: true })
  phone?: string | null;

  @Column({ name: 'refresh_token_hash', length: 255, nullable: true })
  refreshTokenHash?: string | null;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Column({ name: 'last_login', type: 'timestamp', nullable: true })
  lastLogin?: Date | null;

  @OneToMany(() => Expense, (expense) => expense.user)
  expenses: Expense[];

  @OneToMany(() => Notification, (notification) => notification.user)
  notifications: Notification[];

  @OneToMany(() => AuditLog, (auditLog) => auditLog.user)
  auditLogs: AuditLog[];

  @OneToMany(() => Report, (report) => report.generatedBy)
  generatedReports: Report[];

  @OneToMany(() => Category, (category) => category.createdBy)
  createdCategories: Category[];

  @OneToMany(() => ExpenseType, (expenseType) => expenseType.createdBy)
  createdExpenseTypes: ExpenseType[];

  @OneToMany(() => Attachment, (attachment) => attachment.uploadedBy)
  attachments: Attachment[];

  @OneToMany(() => SalesInvoice, (invoice) => invoice.user)
  salesInvoices: SalesInvoice[];

  @OneToMany(() => CreditNote, (creditNote) => creditNote.user)
  creditNotes: CreditNote[];
}

