import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { NotificationType } from '../common/enums/notification-type.enum';
import { NotificationChannel } from '../common/enums/notification-channel.enum';
export declare class Notification extends AbstractEntity {
    organization: Organization;
    user?: User | null;
    title: string;
    message: string;
    type: NotificationType;
    channel: NotificationChannel;
    isRead: boolean;
    scheduledFor?: Date | null;
    sentAt?: Date | null;
}
