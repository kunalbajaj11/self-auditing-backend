import { Repository } from 'typeorm';
import { Notification } from '../../entities/notification.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationFilterDto } from './dto/notification-filter.dto';
import { MarkNotificationDto } from './dto/mark-read.dto';
import { NotificationType } from '../../common/enums/notification-type.enum';
import { NotificationChannel } from '../../common/enums/notification-channel.enum';
import { EmailService } from './email.service';
interface ScheduleNotificationInput {
    organizationId: string;
    userId?: string;
    title: string;
    message: string;
    type: NotificationType;
    channel: NotificationChannel;
    scheduledFor?: Date | string | null;
}
export declare class NotificationsService {
    private readonly notificationsRepository;
    private readonly organizationsRepository;
    private readonly usersRepository;
    private readonly emailService;
    constructor(notificationsRepository: Repository<Notification>, organizationsRepository: Repository<Organization>, usersRepository: Repository<User>, emailService: EmailService);
    calculateReminderDate(expectedDate: string): Date;
    scheduleNotification(input: ScheduleNotificationInput): Promise<Notification>;
    createManual(organizationId: string, dto: CreateNotificationDto): Promise<Notification>;
    findForUser(organizationId: string, userId: string, filters: NotificationFilterDto): Promise<Notification[]>;
    markAsRead(organizationId: string, userId: string, notificationId: string, dto: MarkNotificationDto): Promise<Notification>;
}
export {};
