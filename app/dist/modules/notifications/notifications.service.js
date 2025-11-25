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
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const notification_entity_1 = require("../../entities/notification.entity");
const organization_entity_1 = require("../../entities/organization.entity");
const user_entity_1 = require("../../entities/user.entity");
const notification_channel_enum_1 = require("../../common/enums/notification-channel.enum");
const email_service_1 = require("./email.service");
const DEFAULT_REMINDER_OFFSET_DAYS = Number(process.env.ACCRUAL_REMINDER_OFFSET_DAYS ?? 2);
let NotificationsService = class NotificationsService {
    constructor(notificationsRepository, organizationsRepository, usersRepository, emailService) {
        this.notificationsRepository = notificationsRepository;
        this.organizationsRepository = organizationsRepository;
        this.usersRepository = usersRepository;
        this.emailService = emailService;
    }
    calculateReminderDate(expectedDate) {
        const date = new Date(expectedDate);
        date.setDate(date.getDate() - DEFAULT_REMINDER_OFFSET_DAYS);
        return date;
    }
    async scheduleNotification(input) {
        const organization = await this.organizationsRepository.findOne({
            where: { id: input.organizationId },
        });
        if (!organization) {
            throw new common_1.NotFoundException('Organization not found');
        }
        let user = null;
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
        });
        const saved = await this.notificationsRepository.save(notification);
        if (input.channel === notification_channel_enum_1.NotificationChannel.EMAIL) {
            const recipientEmail = user?.email || organization.contactEmail;
            if (recipientEmail) {
                const shouldSendNow = !input.scheduledFor || new Date(input.scheduledFor) <= new Date();
                if (shouldSendNow) {
                    this.emailService
                        .sendNotificationEmail(recipientEmail, input.title, input.message, input.type)
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
            }
            else {
                console.warn(`Cannot send email notification: No recipient email found. ` +
                    `User: ${user?.id || 'null'}, Organization: ${organization.id}`);
            }
        }
        return saved;
    }
    async createManual(organizationId, dto) {
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
    async findForUser(organizationId, userId, filters) {
        const query = this.notificationsRepository
            .createQueryBuilder('notification')
            .leftJoinAndSelect('notification.organization', 'organization')
            .where('notification.organization_id = :organizationId', {
            organizationId,
        })
            .andWhere('(notification.user_id IS NULL OR notification.user_id = :userId)', { userId });
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
    async markAsRead(organizationId, userId, notificationId, dto) {
        const notification = await this.notificationsRepository.findOne({
            where: {
                id: notificationId,
                organization: { id: organizationId },
            },
        });
        if (!notification) {
            throw new common_1.NotFoundException('Notification not found');
        }
        if (notification.user &&
            notification.user.id !== userId) {
            throw new common_1.NotFoundException('Notification not accessible');
        }
        notification.isRead = dto.isRead;
        if (dto.isRead) {
            notification.sentAt = notification.sentAt ?? new Date();
        }
        return this.notificationsRepository.save(notification);
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(notification_entity_1.Notification)),
    __param(1, (0, typeorm_1.InjectRepository)(organization_entity_1.Organization)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        email_service_1.EmailService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map