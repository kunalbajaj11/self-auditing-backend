import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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
  entityType?: string | null; // e.g., 'invoice', 'expense', 'accrual'
  entityId?: string | null; // Reference to the invoice/expense/accrual ID
  recipientEmail?: string | null; // Optional direct email (for customers)
  templateVariables?: Record<string, any>; // Variables for email template rendering
}

const DEFAULT_REMINDER_OFFSET_DAYS = Number(
  process.env.ACCRUAL_REMINDER_OFFSET_DAYS ?? 2,
);

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly emailService: EmailService,
  ) {}

  calculateReminderDate(expectedDate: string): Date {
    const date = new Date(expectedDate);
    date.setDate(date.getDate() - DEFAULT_REMINDER_OFFSET_DAYS);
    return date;
  }

  async scheduleNotification(
    input: ScheduleNotificationInput,
  ): Promise<Notification> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: input.organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    let user: User | null = null;
    if (input.userId) {
      user = await this.usersRepository.findOne({
        where: { id: input.userId },
      });
    }

    const notification = this.notificationsRepository.create({
      organization,
      user: user ?? null,
      title: input.title,
      message: input.message,
      type: input.type,
      channel: input.channel,
      scheduledFor: input.scheduledFor
        ? new Date(input.scheduledFor)
        : null,
      isRead: false,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    });

    const saved = await this.notificationsRepository.save(notification);

    // Send email if channel includes email
    if (input.channel === NotificationChannel.EMAIL) {
      // Determine recipient email: direct email > user email > organization contact email
      const recipientEmail =
        input.recipientEmail || user?.email || organization.contactEmail;

      if (recipientEmail) {
        // Send immediately if not scheduled, or schedule for later
        const shouldSendNow = !input.scheduledFor || new Date(input.scheduledFor) <= new Date();
        
        if (shouldSendNow) {
          this.emailService
            .sendNotificationEmail(
              recipientEmail,
              input.title,
              input.message,
              input.type,
              organization.id,
              input.templateVariables,
            )
            .then((sent) => {
              if (sent) {
                saved.sentAt = new Date();
                this.notificationsRepository.save(saved);
              }
            })
            .catch((error) => {
              console.error('Error sending notification email:', error);
            });
        }
      } else {
        console.warn(
          `Cannot send email notification: No recipient email found. ` +
          `User: ${user?.id || 'null'}, Organization: ${organization.id}`
        );
      }
    }

    return saved;
  }

  async createManual(
    organizationId: string,
    dto: CreateNotificationDto,
  ): Promise<Notification> {
    return this.scheduleNotification({
      organizationId,
      userId: dto.userId,
      title: dto.title,
      message: dto.message,
      type: dto.type,
      channel: dto.channel,
      scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
    });
  }

  async findForUser(
    organizationId: string,
    userId: string,
    filters: NotificationFilterDto,
  ): Promise<Notification[]> {
    const query = this.notificationsRepository
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.organization', 'organization')
      .where('notification.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere(
        '(notification.user_id IS NULL OR notification.user_id = :userId)',
        { userId },
      );

    if (filters.type) {
      query.andWhere('notification.type = :type', { type: filters.type });
    }
    if (filters.isRead !== undefined) {
      const isRead = filters.isRead === 'true';
      query.andWhere('notification.is_read = :isRead', { isRead });
    }

    query.orderBy('notification.created_at', 'DESC');

    return query.getMany();
  }

  async markAsRead(
    organizationId: string,
    userId: string,
    notificationId: string,
    dto: MarkNotificationDto,
  ): Promise<Notification> {
    const notification = await this.notificationsRepository.findOne({
      where: {
        id: notificationId,
        organization: { id: organizationId },
      },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (
      notification.user &&
      notification.user.id !== userId
    ) {
      throw new NotFoundException('Notification not accessible');
    }

    notification.isRead = dto.isRead;
    if (dto.isRead) {
      notification.sentAt = notification.sentAt ?? new Date();
    }
    return this.notificationsRepository.save(notification);
  }
}

