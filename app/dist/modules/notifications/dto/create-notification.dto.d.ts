import { NotificationType } from '../../../common/enums/notification-type.enum';
import { NotificationChannel } from '../../../common/enums/notification-channel.enum';
export declare class CreateNotificationDto {
    userId?: string;
    title: string;
    message: string;
    type: NotificationType;
    channel: NotificationChannel;
    scheduledFor?: string;
}
