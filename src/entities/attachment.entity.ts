import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Expense } from './expense.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';

@Entity({ name: 'attachments' })
export class Attachment extends AbstractEntity {
  @ManyToOne(() => Expense, (expense) => expense.attachments, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'expense_id' })
  expense: Expense;

  @ManyToOne(() => Organization, (organization) => organization.attachments, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'file_name', length: 255 })
  fileName: string;

  @Column({ name: 'file_url', type: 'text' })
  fileUrl: string;

  @Column({ name: 'file_key', type: 'text', nullable: true })
  fileKey?: string | null;

  @Column({ name: 'file_type', length: 50 })
  fileType: string;

  @Column({ name: 'file_size', type: 'int' })
  fileSize: number;

  @ManyToOne(() => User, (user) => user.attachments, { nullable: true })
  @JoinColumn({ name: 'uploaded_by' })
  uploadedBy?: User | null;
}
