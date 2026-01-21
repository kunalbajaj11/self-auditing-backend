import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceCalendarService } from './compliance-calendar.service';
import { ComplianceReportsService } from './compliance-reports.service';
import { ComplianceReminderService } from './compliance-reminder.service';
import { ComplianceController } from './compliance.controller';
import { ComplianceDeadline } from '../../entities/compliance-deadline.entity';
import { TaxForm } from '../../entities/tax-form.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ComplianceDeadline, TaxForm, Organization, User]),
    NotificationsModule,
  ],
  providers: [
    ComplianceCalendarService,
    ComplianceReportsService,
    ComplianceReminderService,
  ],
  controllers: [ComplianceController],
  exports: [
    ComplianceCalendarService,
    ComplianceReportsService,
    ComplianceReminderService,
  ],
})
export class ComplianceModule {}
