import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../../entities/notification.entity';
import { Accrual } from '../../entities/accrual.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { NotificationChannel } from '../../common/enums/notification-channel.enum';
import { NotificationType } from '../../common/enums/notification-type.enum';
import { AccrualStatus } from '../../common/enums/accrual-status.enum';
import { ReconciliationRecord } from '../../entities/reconciliation-record.entity';
import { ReconciliationStatus } from '../../common/enums/reconciliation-status.enum';
import { User } from '../../entities/user.entity';
import { UserRole } from '../../common/enums/user-role.enum';

@Injectable()
export class SchedulerService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    @InjectRepository(Accrual)
    private readonly accrualsRepository: Repository<Accrual>,
    @InjectRepository(ReconciliationRecord)
    private readonly reconciliationRecordsRepository: Repository<ReconciliationRecord>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
  ) {}

  // Run every hour to send scheduled notifications
  @Cron(CronExpression.EVERY_HOUR)
  async sendScheduledNotifications() {
    const now = new Date();
    const scheduledNotifications = await this.notificationsRepository.find({
      where: {
        isRead: false,
        sentAt: null,
      },
      relations: ['user', 'organization'],
    });

    for (const notification of scheduledNotifications) {
      if (
        notification.scheduledFor &&
        new Date(notification.scheduledFor) <= now
      ) {
        // Send email if channel includes email
        if (
          notification.channel === NotificationChannel.EMAIL &&
          notification.user?.email
        ) {
          const sent = await this.emailService.sendNotificationEmail(
            notification.user.email,
            notification.title,
            notification.message,
            notification.type,
          );

          if (sent) {
            notification.sentAt = new Date();
            await this.notificationsRepository.save(notification);
          }
        }
      }
    }
  }

  // Run daily at 9 AM to check for accrual reminders
  @Cron('0 9 * * *')
  async checkAccrualReminders() {
    const reminderOffsetDays = Number(
      process.env.ACCRUAL_REMINDER_OFFSET_DAYS ?? 2,
    );
    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + reminderOffsetDays);

    const accruals = await this.accrualsRepository.find({
      where: {
        status: AccrualStatus.PENDING_SETTLEMENT,
      },
      relations: ['organization', 'expense', 'expense.user'],
    });

    for (const accrual of accruals) {
      if (
        accrual.expectedPaymentDate &&
        new Date(accrual.expectedPaymentDate).toDateString() ===
          reminderDate.toDateString()
      ) {
        const user = accrual.expense?.user;
        if (user?.email) {
          const title = 'Accrual Payment Reminder';
          const message = `Reminder: Payment of AED ${accrual.amount} for accrual ${accrual.id} is due on ${accrual.expectedPaymentDate}.`;

          await this.notificationsService.scheduleNotification({
            organizationId: accrual.organization.id,
            userId: user.id,
            title,
            message,
            type: NotificationType.ACCRUAL_REMINDER,
            channel: NotificationChannel.EMAIL,
          });
        }
      }
    }
  }

  // Run weekly on Monday at 9 AM to check for pending reconciliations
  @Cron('0 9 * * 1')
  async checkPendingReconciliations() {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const records = await this.reconciliationRecordsRepository.find({
      where: {},
      relations: ['organization', 'createdBy', 'bankTransactions'],
    });

    for (const record of records) {
      // Check if there are unmatched transactions
      const unmatchedCount = record.bankTransactions?.filter(
        (t) => t.status === ReconciliationStatus.UNMATCHED,
      ).length || 0;

      if (unmatchedCount > 0) {
        // Find admin users for the organization
        const adminUsers = await this.usersRepository.find({
          where: {
            organization: { id: record.organization.id },
            role: UserRole.ADMIN,
          },
        });

        for (const admin of adminUsers) {
          if (admin.email) {
            const title = 'Pending Bank Reconciliation';
            const message = `You have ${unmatchedCount} unmatched transaction(s) in your bank reconciliation dated ${record.reconciliationDate}. Please review and complete the reconciliation.`;

            await this.notificationsService.scheduleNotification({
              organizationId: record.organization.id,
              userId: admin.id,
              title,
              message,
              type: NotificationType.SYSTEM,
              channel: NotificationChannel.EMAIL,
            });
          }
        }
      }
    }
  }
}

