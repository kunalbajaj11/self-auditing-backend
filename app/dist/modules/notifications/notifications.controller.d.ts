import { NotificationsService } from './notifications.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { NotificationFilterDto } from './dto/notification-filter.dto';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { MarkNotificationDto } from './dto/mark-read.dto';
export declare class NotificationsController {
    private readonly notificationsService;
    constructor(notificationsService: NotificationsService);
    list(user: AuthenticatedUser, filters: NotificationFilterDto): Promise<import("../../entities/notification.entity").Notification[]>;
    create(user: AuthenticatedUser, dto: CreateNotificationDto): Promise<import("../../entities/notification.entity").Notification>;
    markRead(id: string, user: AuthenticatedUser, dto: MarkNotificationDto): Promise<import("../../entities/notification.entity").Notification>;
}
