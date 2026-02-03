import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { NotificationType } from '../common/enums/notification-type.enum';
import { NotificationChannel } from '../common/enums/notification-channel.enum';

@Entity({ name: 'notifications' })
@Index('idx_notifications_user_read', ['user', 'isRead'])
export class Notification extends AbstractEntity {
  @ManyToOne(() => Organization, (organization) => organization.notifications, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User, (user) => user.notifications, {
    nullable: true,
  })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ length: 150 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
  })
  type: NotificationType;

  @Column({
    type: 'enum',
    enum: NotificationChannel,
    default: NotificationChannel.EMAIL,
  })
  channel: NotificationChannel;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @Column({ name: 'scheduled_for', type: 'timestamp', nullable: true })
  scheduledFor?: Date | null;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt?: Date | null;

  /**
   * Number of times we attempted to send this notification.
   * Used by the hourly scheduler to cap retries.
   */
  @Column({ name: 'send_attempts', type: 'int', default: 0 })
  sendAttempts: number;

  @Column({ name: 'last_attempt_at', type: 'timestamp', nullable: true })
  lastAttemptAt?: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ name: 'entity_type', length: 50, nullable: true })
  entityType?: string | null; // e.g., 'invoice', 'expense', 'accrual'

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId?: string | null; // Reference to the invoice/expense/accrual ID
}
