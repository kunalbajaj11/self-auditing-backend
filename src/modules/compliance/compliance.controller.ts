import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ComplianceCalendarService } from './compliance-calendar.service';
import { ComplianceReportsService } from './compliance-reports.service';
import { ComplianceReminderService } from './compliance-reminder.service';
import {
  ComplianceType,
  FilingFrequency,
  DeadlineStatus,
} from '../../entities/compliance-deadline.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';

@Controller('compliance')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class ComplianceController {
  constructor(
    private readonly calendarService: ComplianceCalendarService,
    private readonly reportsService: ComplianceReportsService,
    private readonly reminderService: ComplianceReminderService,
  ) {}

  // Calendar endpoints
  @Get('deadlines')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getDeadlines(
    @CurrentUser() user: AuthenticatedUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('complianceType') complianceType?: ComplianceType,
  ) {
    return this.calendarService.getDeadlines(
      user?.organizationId as string,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      complianceType,
    );
  }

  @Get('deadlines/upcoming')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getUpcomingDeadlines(
    @CurrentUser() user: AuthenticatedUser,
    @Query('days') days?: number,
  ) {
    return this.calendarService.getUpcomingDeadlines(
      user?.organizationId as string,
      days ? parseInt(days.toString(), 10) : 30,
    );
  }

  @Get('deadlines/overdue')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getOverdueDeadlines(@CurrentUser() user: AuthenticatedUser) {
    return this.calendarService.getOverdueDeadlines(
      user?.organizationId as string,
    );
  }

  @Post('deadlines')
  @Roles(UserRole.ADMIN)
  async createDeadline(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: {
      complianceType: ComplianceType;
      period: string;
      dueDate: string;
      filingFrequency: FilingFrequency;
    },
  ) {
    return this.calendarService.createDeadline(user?.organizationId as string, {
      complianceType: body.complianceType,
      period: body.period,
      dueDate: new Date(body.dueDate),
      filingFrequency: body.filingFrequency,
    });
  }

  @Post('deadlines/generate')
  @Roles(UserRole.ADMIN)
  async generateDeadlines(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: {
      complianceType: ComplianceType;
      startDate: string;
      endDate: string;
      filingFrequency: FilingFrequency;
    },
  ) {
    return this.calendarService.generateDeadlinesForPeriod(
      user?.organizationId as string,
      body.complianceType,
      new Date(body.startDate),
      new Date(body.endDate),
      body.filingFrequency,
    );
  }

  @Patch('deadlines/:id/status')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async updateDeadlineStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { status: DeadlineStatus; filingReference?: string },
  ) {
    return this.calendarService.updateDeadlineStatus(
      id,
      user?.organizationId as string,
      body.status,
      body.filingReference,
    );
  }

  // Reports endpoints
  @Get('summary')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getComplianceSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.generateComplianceSummary(
      user?.organizationId as string,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('calendar')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getComplianceCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Query('year') year: number,
    @Query('month') month?: number,
  ) {
    return this.reportsService.generateComplianceCalendar(
      user?.organizationId as string,
      year,
      month,
    );
  }

  @Get('payment-tracking')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getPaymentTracking(
    @CurrentUser() user: AuthenticatedUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.generatePaymentTrackingReport(
      user?.organizationId as string,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  // Reminder endpoints
  @Post('reminders/send')
  @Roles(UserRole.ADMIN)
  async sendReminders(@CurrentUser() user: AuthenticatedUser) {
    await this.reminderService.sendRemindersForOrganization(
      user?.organizationId as string,
    );
    return { success: true, message: 'Reminders sent' };
  }
}

