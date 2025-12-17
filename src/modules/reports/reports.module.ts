import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ReportGeneratorService } from './report-generator.service';
import { Expense } from '../../entities/expense.entity';
import { Accrual } from '../../entities/accrual.entity';
import { Report } from '../../entities/report.entity';
import { Organization } from '../../entities/organization.entity';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { User } from '../../entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Expense,
      Accrual,
      Report,
      Organization,
      SalesInvoice,
      User,
    ]),
    NotificationsModule,
  ],
  providers: [ReportsService, ReportGeneratorService],
  controllers: [ReportsController],
  exports: [ReportsService, ReportGeneratorService],
})
export class ReportsModule {}
