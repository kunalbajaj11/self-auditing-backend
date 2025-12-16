import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { NotificationType } from '../common/enums/notification-type.enum';

@Entity({ name: 'email_templates' })
@Index(['organization', 'type'])
export class EmailTemplate extends AbstractEntity {
  @ManyToOne(() => Organization, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({
    type: 'enum',
    enum: NotificationType,
  })
  type: NotificationType;

  @Column({ length: 200 })
  subject: string;

  @Column({ type: 'text' })
  htmlBody: string;

  @Column({ type: 'text', nullable: true })
  textBody?: string | null;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean; // True for system-wide default templates

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
