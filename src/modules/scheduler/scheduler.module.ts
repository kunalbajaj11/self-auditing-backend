import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerService } from './scheduler.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { Notification } from '../../entities/notification.entity';
import { Accrual } from '../../entities/accrual.entity';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { Expense } from '../../entities/expense.entity';
import { ReconciliationRecord } from '../../entities/reconciliation-record.entity';
import { User } from '../../entities/user.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      Notification,
      Accrual,
      SalesInvoice,
      Expense,
      ReconciliationRecord,
      User,
    ]),
    NotificationsModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
