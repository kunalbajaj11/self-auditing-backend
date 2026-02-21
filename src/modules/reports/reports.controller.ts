import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { ReportGeneratorService } from './report-generator.service';
import { EmailService } from '../notifications/email.service';
import { SettingsService } from '../settings/settings.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ReportHistoryFilterDto } from './dto/report-history-filter.dto';
import { GenerateReportDto } from './dto/generate-report.dto';
import { ScheduleReportDto } from './dto/schedule-report.dto';
import { AccountEntriesDto } from './dto/account-entries.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly reportGeneratorService: ReportGeneratorService,
    private readonly emailService: EmailService,
    private readonly settingsService: SettingsService,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  @Get('history')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: ReportHistoryFilterDto,
  ) {
    return this.reportsService.listHistory(
      user?.organizationId as string,
      filters,
    );
  }

  @Get('filter-options')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getFilterOptions(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getFilterOptions(user?.organizationId as string);
  }

  @Get('account-entries')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getAccountEntries(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: AccountEntriesDto,
  ) {
    return this.reportsService.getAccountEntries(
      user?.organizationId as string,
      dto.accountName,
      dto.accountType,
      dto.startDate,
      dto.endDate,
    );
  }

  @Get('dashboard-summary')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getDashboardSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getDashboardSummary(
      user?.organizationId as string,
      { startDate, endDate },
    );
  }

  @Post('generate')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateReportDto,
  ) {
    return this.reportsService.generate(
      user?.organizationId as string,
      user?.userId as string,
      dto,
    );
  }

  @Get(':id/download')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async download(
    @Param('id') id: string,
    @Query('format') format: 'pdf' | 'xlsx' | 'csv' = 'pdf',
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const report = await this.reportsService.findById(
      id,
      user?.organizationId as string,
    );

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // Regenerate report data
    const reportData = await this.reportsService.generate(
      user?.organizationId as string,
      user?.userId as string,
      {
        type: report.type,
        filters: report.filters || {},
      },
    );

    // Get organization and user details for metadata
    const organization = await this.organizationsRepository.findOne({
      where: { id: user?.organizationId as string },
    });
    const generatedByUser = await this.usersRepository.findOne({
      where: { id: user?.userId as string },
    });

    // Fetch organization logo buffer for PDF reports
    const logoBuffer = await this.settingsService.getInvoiceLogoBuffer(
      user?.organizationId as string,
    );

    let buffer: Buffer;
    let contentType: string;
    let filename: string;

    const reportName = `${report.type}_${new Date().toISOString().split('T')[0]}`;

    // Extract report period from filters
    const reportPeriod = report.filters
      ? {
          startDate: report.filters.startDate,
          endDate: report.filters.endDate,
        }
      : undefined;

    // Build metadata with all required fields
    const metadata = {
      organizationName: organization?.name,
      vatNumber: organization?.vatNumber || undefined,
      address: organization?.address || undefined,
      phone: organization?.contactPerson || undefined, // Using contactPerson as phone placeholder
      email: organization?.contactEmail || undefined,
      currency: organization?.currency || 'AED',
      logoBuffer: logoBuffer || undefined, // Organization logo for PDF header
      generatedAt: reportData.generatedAt,
      generatedBy: user?.userId,
      generatedByName: generatedByUser?.name || 'System',
      organizationId: organization?.id,
      filters: report.filters || {},
      reportPeriod,
      summary: reportData.summary,
    };

    switch (format) {
      case 'pdf':
        buffer = await this.reportGeneratorService.generatePDF({
          type: report.type,
          data: reportData.data,
          metadata,
        });
        contentType = 'application/pdf';
        filename = `${reportName}.pdf`;
        break;
      case 'xlsx':
        buffer = await this.reportGeneratorService.generateXLSX({
          type: report.type,
          data: reportData.data,
          metadata,
        });
        contentType =
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = `${reportName}.xlsx`;
        break;
      case 'csv':
        buffer = await this.reportGeneratorService.generateCSV({
          type: report.type,
          data: reportData.data,
          metadata,
        });
        contentType = 'text/csv';
        filename = `${reportName}.csv`;
        break;
      default:
        return res.status(400).json({ message: 'Invalid format' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async deleteReport(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.reportsService.delete(id, user?.organizationId as string);
    return { success: true, message: 'Report removed from history' };
  }

  @Post('schedule')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async schedule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ScheduleReportDto,
  ) {
    // For now, generate report immediately and email if recipient provided
    // In future, can integrate with scheduler for recurring reports
    const reportData = await this.reportsService.generate(
      user?.organizationId as string,
      user?.userId as string,
      {
        type: dto.type,
        filters: dto.filters || {},
      },
    );

    // Get organization and user details for metadata
    const organization = await this.organizationsRepository.findOne({
      where: { id: user?.organizationId as string },
    });
    const generatedByUser = await this.usersRepository.findOne({
      where: { id: user?.userId as string },
    });

    // Extract report period from filters
    const reportPeriod = dto.filters
      ? {
          startDate: dto.filters.startDate,
          endDate: dto.filters.endDate,
        }
      : undefined;

    // If email recipient provided, generate file and send
    if (dto.recipientEmail && dto.format) {
      const format = dto.format || 'pdf';
      const reportName = `${dto.type}_${new Date().toISOString().split('T')[0]}`;

      // Fetch organization logo buffer for PDF reports
      const logoBuffer = await this.settingsService.getInvoiceLogoBuffer(
        user?.organizationId as string,
      );

      const metadata = {
        organizationName: organization?.name,
        vatNumber: organization?.vatNumber || undefined,
        address: organization?.address || undefined,
        phone: organization?.contactPerson || undefined,
        email: organization?.contactEmail || undefined,
        currency: organization?.currency || 'AED',
        logoBuffer: logoBuffer || undefined, // Organization logo for PDF header
        generatedAt: reportData.generatedAt,
        generatedBy: user?.userId,
        generatedByName: generatedByUser?.name || 'System',
        organizationId: organization?.id,
        filters: dto.filters || {},
        reportPeriod,
        summary: reportData.summary,
      };

      let buffer: Buffer;
      switch (format) {
        case 'pdf':
          buffer = await this.reportGeneratorService.generatePDF({
            type: dto.type,
            data: reportData.data,
            metadata,
          });
          break;
        case 'xlsx':
          buffer = await this.reportGeneratorService.generateXLSX({
            type: dto.type,
            data: reportData.data,
            metadata,
          });
          break;
        case 'csv':
          buffer = await this.reportGeneratorService.generateCSV({
            type: dto.type,
            data: reportData.data,
            metadata,
          });
          break;
        default:
          buffer = Buffer.alloc(0);
      }

      await this.emailService.sendReportEmail(
        dto.recipientEmail,
        reportName,
        buffer,
        format,
      );
    }

    return {
      success: true,
      message: 'Report scheduled and sent',
      report: reportData,
    };
  }
}
