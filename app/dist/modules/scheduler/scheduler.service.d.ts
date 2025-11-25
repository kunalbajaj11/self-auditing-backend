import { Repository } from 'typeorm';
import { Notification } from '../../entities/notification.entity';
import { Accrual } from '../../entities/accrual.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { ReconciliationRecord } from '../../entities/reconciliation-record.entity';
import { User } from '../../entities/user.entity';
export declare class SchedulerService {
    private readonly notificationsRepository;
    private readonly accrualsRepository;
    private readonly reconciliationRecordsRepository;
    private readonly usersRepository;
    private readonly notificationsService;
    private readonly emailService;
    constructor(notificationsRepository: Repository<Notification>, accrualsRepository: Repository<Accrual>, reconciliationRecordsRepository: Repository<ReconciliationRecord>, usersRepository: Repository<User>, notificationsService: NotificationsService, emailService: EmailService);
    sendScheduledNotifications(): Promise<void>;
    checkAccrualReminders(): Promise<void>;
    checkPendingReconciliations(): Promise<void>;
}
