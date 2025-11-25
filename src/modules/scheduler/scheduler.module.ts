import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerService } from './scheduler.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { Notification } from '../../entities/notification.entity';
import { Accrual } from '../../entities/accrual.entity';
import { ReconciliationRecord } from '../../entities/reconciliation-record.entity';
import { User } from '../../entities/user.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Notification, Accrual, ReconciliationRecord, User]),
    NotificationsModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}

