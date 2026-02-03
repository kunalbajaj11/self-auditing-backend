"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const notification_entity_1 = require("../../entities/notification.entity");
const accrual_entity_1 = require("../../entities/accrual.entity");
const notifications_service_1 = require("../notifications/notifications.service");
const email_service_1 = require("../notifications/email.service");
const notification_channel_enum_1 = require("../../common/enums/notification-channel.enum");
const notification_type_enum_1 = require("../../common/enums/notification-type.enum");
const accrual_status_enum_1 = require("../../common/enums/accrual-status.enum");
const reconciliation_record_entity_1 = require("../../entities/reconciliation-record.entity");
const reconciliation_status_enum_1 = require("../../common/enums/reconciliation-status.enum");
const user_entity_1 = require("../../entities/user.entity");
const user_role_enum_1 = require("../../common/enums/user-role.enum");
let SchedulerService = class SchedulerService {
    constructor(notificationsRepository, accrualsRepository, reconciliationRecordsRepository, usersRepository, notificationsService, emailService) {
        this.notificationsRepository = notificationsRepository;
        this.accrualsRepository = accrualsRepository;
        this.reconciliationRecordsRepository = reconciliationRecordsRepository;
        this.usersRepository = usersRepository;
        this.notificationsService = notificationsService;
        this.emailService = emailService;
    }
    async sendScheduledNotifications() {
        const now = new Date();
        const scheduledNotifications = await this.notificationsRepository.find({
            where: {
                isRead: false,
                sentAt: null,
                scheduledFor: (0, typeorm_2.LessThanOrEqual)(now),
                sendAttempts: (0, typeorm_2.LessThan)(SchedulerService.MAX_NOTIFICATION_SEND_ATTEMPTS),
            },
            relations: ['user', 'organization'],
        });
        for (const notification of scheduledNotifications) {
            const claim = await this.notificationsRepository
                .createQueryBuilder()
                .update(notification_entity_1.Notification)
                .set({
                sendAttempts: () => '"send_attempts" + 1',
                lastAttemptAt: () => 'CURRENT_TIMESTAMP',
            })
                .where('id = :id', { id: notification.id })
                .andWhere('sent_at IS NULL')
                .andWhere('send_attempts < :max', { max: SchedulerService.MAX_NOTIFICATION_SEND_ATTEMPTS })
                .execute();
            if (!claim.affected) {
                continue;
            }
            if (notification.channel !== notification_channel_enum_1.NotificationChannel.EMAIL) {
                continue;
            }
            const recipientEmail = notification.user?.email || notification.organization?.contactEmail;
            if (!recipientEmail) {
                await this.notificationsRepository.update(notification.id, {
                    sendAttempts: SchedulerService.MAX_NOTIFICATION_SEND_ATTEMPTS,
                    lastError: 'No recipient email available',
                });
                continue;
            }
            const expectedAttempts = (notification.sendAttempts ?? 0) + 1;
            try {
                const sent = await this.emailService.sendNotificationEmail(recipientEmail, notification.title, notification.message, notification.type);
                if (sent) {
                    await this.notificationsRepository.update(notification.id, {
                        sentAt: new Date(),
                        lastError: null,
                    });
                }
                else if (expectedAttempts >= SchedulerService.MAX_NOTIFICATION_SEND_ATTEMPTS) {
                    await this.notificationsRepository.update(notification.id, {
                        lastError: 'Email send failed (max retries reached)',
                    });
                }
                else {
                    await this.notificationsRepository.update(notification.id, {
                        lastError: 'Email send failed',
                    });
                }
            }
            catch (error) {
                const message = error?.message || 'Unknown error';
                await this.notificationsRepository.update(notification.id, {
                    lastError: expectedAttempts >= SchedulerService.MAX_NOTIFICATION_SEND_ATTEMPTS
                        ? `Email send error (max retries reached): ${message}`
                        : `Email send error: ${message}`,
                });
            }
        }
    }
    async checkAccrualReminders() {
        const reminderOffsetDays = Number(process.env.ACCRUAL_REMINDER_OFFSET_DAYS ?? 2);
        const reminderDate = new Date();
        reminderDate.setDate(reminderDate.getDate() + reminderOffsetDays);
        const accruals = await this.accrualsRepository.find({
            where: {
                status: accrual_status_enum_1.AccrualStatus.PENDING_SETTLEMENT,
            },
            relations: ['organization', 'expense', 'expense.user'],
        });
        for (const accrual of accruals) {
            if (accrual.expectedPaymentDate &&
                new Date(accrual.expectedPaymentDate).toDateString() ===
                    reminderDate.toDateString()) {
                const user = accrual.expense?.user;
                if (user?.email) {
                    const title = 'Accrual Payment Reminder';
                    const message = `Reminder: Payment of AED ${accrual.amount} for accrual ${accrual.id} is due on ${accrual.expectedPaymentDate}.`;
                    await this.notificationsService.scheduleNotification({
                        organizationId: accrual.organization.id,
                        userId: user.id,
                        title,
                        message,
                        type: notification_type_enum_1.NotificationType.ACCRUAL_REMINDER,
                        channel: notification_channel_enum_1.NotificationChannel.EMAIL,
                    });
                }
            }
        }
    }
    async checkPendingReconciliations() {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const records = await this.reconciliationRecordsRepository.find({
            where: {},
            relations: ['organization', 'createdBy', 'bankTransactions'],
        });
        for (const record of records) {
            const unmatchedCount = record.bankTransactions?.filter((t) => t.status === reconciliation_status_enum_1.ReconciliationStatus.UNMATCHED).length || 0;
            if (unmatchedCount > 0) {
                const adminUsers = await this.usersRepository.find({
                    where: {
                        organization: { id: record.organization.id },
                        role: user_role_enum_1.UserRole.ADMIN,
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
                            type: notification_type_enum_1.NotificationType.SYSTEM,
                            channel: notification_channel_enum_1.NotificationChannel.EMAIL,
                        });
                    }
                }
            }
        }
    }
};
exports.SchedulerService = SchedulerService;
SchedulerService.MAX_NOTIFICATION_SEND_ATTEMPTS = 3;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_HOUR),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SchedulerService.prototype, "sendScheduledNotifications", null);
__decorate([
    (0, schedule_1.Cron)('0 9 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SchedulerService.prototype, "checkAccrualReminders", null);
__decorate([
    (0, schedule_1.Cron)('0 9 * * 1'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SchedulerService.prototype, "checkPendingReconciliations", null);
exports.SchedulerService = SchedulerService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(notification_entity_1.Notification)),
    __param(1, (0, typeorm_1.InjectRepository)(accrual_entity_1.Accrual)),
    __param(2, (0, typeorm_1.InjectRepository)(reconciliation_record_entity_1.ReconciliationRecord)),
    __param(3, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        notifications_service_1.NotificationsService,
        email_service_1.EmailService])
], SchedulerService);
//# sourceMappingURL=scheduler.service.js.map