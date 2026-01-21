import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceCalendarService } from './compliance-calendar.service';
import { ComplianceDeadline } from '../../entities/compliance-deadline.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../common/enums/notification-type.enum';
import { NotificationChannel } from '../../common/enums/notification-channel.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationStatus } from '../../common/enums/organization-status.enum';

@Injectable()
export class ComplianceReminderService {
  private readonly logger = new Logger(ComplianceReminderService.name);

  constructor(
    @InjectRepository(ComplianceDeadline)
    private readonly deadlinesRepository: Repository<ComplianceDeadline>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly calendarService: ComplianceCalendarService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Send compliance reminders for all organizations
   */
  async sendRemindersForAllOrganizations(): Promise<void> {
    this.logger.log('Sending compliance reminders for all organizations');

    const organizations = await this.organizationsRepository.find({
      where: { status: OrganizationStatus.ACTIVE },
    });

    for (const org of organizations) {
      try {
        await this.sendRemindersForOrganization(org.id);
      } catch (error) {
        this.logger.error(
          `Error sending reminders for organization ${org.id}:`,
          error,
        );
      }
    }
  }

  /**
   * Send compliance reminders for an organization
   */
  async sendRemindersForOrganization(organizationId: string): Promise<void> {
    const deadlines =
      await this.calendarService.getDeadlinesNeedingReminders(organizationId);

    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
      relations: ['users'],
    });

    if (!organization) {
      return;
    }

    // Send 30-day reminders
    for (const deadline of deadlines.due30d) {
      await this.sendReminder(organizationId, deadline, 30);
      deadline.reminderSent30d = true;
      await this.deadlinesRepository.save(deadline);
    }

    // Send 15-day reminders
    for (const deadline of deadlines.due15d) {
      await this.sendReminder(organizationId, deadline, 15);
      deadline.reminderSent15d = true;
      await this.deadlinesRepository.save(deadline);
    }

    // Send 7-day reminders
    for (const deadline of deadlines.due7d) {
      await this.sendReminder(organizationId, deadline, 7);
      deadline.reminderSent7d = true;
      await this.deadlinesRepository.save(deadline);
    }

    // Send 1-day reminders
    for (const deadline of deadlines.due1d) {
      await this.sendReminder(organizationId, deadline, 1);
      deadline.reminderSent1d = true;
      await this.deadlinesRepository.save(deadline);
    }

    // Send due today reminders
    for (const deadline of deadlines.dueToday) {
      await this.sendReminder(organizationId, deadline, 0);
      deadline.reminderSentDue = true;
      await this.deadlinesRepository.save(deadline);
    }

    // Send overdue reminders
    for (const deadline of deadlines.overdue) {
      await this.sendReminder(organizationId, deadline, -1);
      deadline.reminderSentOverdue = true;
      await this.deadlinesRepository.save(deadline);
    }
  }

  /**
   * Send a single reminder
   */
  private async sendReminder(
    organizationId: string,
    deadline: ComplianceDeadline,
    daysUntilDue: number,
  ): Promise<void> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      return;
    }

    let subject: string;
    let message: string;

    if (daysUntilDue < 0) {
      const daysOverdue = Math.abs(daysUntilDue);
      subject = `⚠️ OVERDUE: ${deadline.complianceType} filing required`;
      message = `Your ${deadline.complianceType} filing for period ${deadline.period} is ${daysOverdue} day(s) overdue. Please file immediately to avoid penalties.`;
    } else if (daysUntilDue === 0) {
      subject = `🔴 DUE TODAY: ${deadline.complianceType} filing required`;
      message = `Your ${deadline.complianceType} filing for period ${deadline.period} is due today. Please file immediately.`;
    } else {
      subject = `📅 Reminder: ${deadline.complianceType} filing due in ${daysUntilDue} day(s)`;
      message = `Your ${deadline.complianceType} filing for period ${deadline.period} is due in ${daysUntilDue} day(s) (${deadline.dueDate.toISOString().split('T')[0]}).`;
    }

    // Send notification to all admins and accountants
    const adminUsers = await this.usersRepository.find({
      where: {
        organization: { id: organizationId },
        role: UserRole.ADMIN,
        isDeleted: false,
      },
    });

    const accountantUsers = await this.usersRepository.find({
      where: {
        organization: { id: organizationId },
        role: UserRole.ACCOUNTANT,
        isDeleted: false,
      },
    });

    const allUsers = [...adminUsers, ...accountantUsers];

    for (const user of allUsers) {
      await this.notificationsService.scheduleNotification({
        organizationId,
        userId: user.id,
        type: NotificationType.SYSTEM, // Use SYSTEM type for compliance reminders
        channel: NotificationChannel.EMAIL,
        title: subject,
        message,
        entityType: 'compliance_deadline',
        entityId: deadline.id,
        templateVariables: {
          deadlineId: deadline.id,
          complianceType: deadline.complianceType,
          period: deadline.period,
          dueDate: deadline.dueDate.toISOString(),
          daysUntilDue,
        },
      });
    }

    this.logger.log(
      `Reminder sent for deadline ${deadline.id}, daysUntilDue=${daysUntilDue}`,
    );
  }
}
