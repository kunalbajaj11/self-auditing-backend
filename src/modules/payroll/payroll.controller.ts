import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { PayrollService } from './payroll.service';
import { CreateSalaryProfileDto } from './dto/create-salary-profile.dto';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { UpdateSalaryProfileDto } from './dto/update-salary-profile.dto';
import { UpdatePayrollRunDto } from './dto/update-payroll-run.dto';
import { PayrollRunFilterDto } from './dto/payroll-run-filter.dto';
import { PayrollReportFilterDto } from './dto/payroll-report-filter.dto';
import { BulkUpdateProfilesDto } from './dto/bulk-update-profiles.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PlanTypeGuard } from '../../common/guards/plan-type.guard';
import { LicenseFeatureGuard } from '../../common/guards/license-feature.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PlanTypes } from '../../common/decorators/plan-types.decorator';
import { RequireLicenseFeature } from '../../common/decorators/license-feature.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { PlanType } from '../../common/enums/plan-type.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';

@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, LicenseFeatureGuard)
@RequireLicenseFeature('payroll') // Requires payroll feature to be enabled in license
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  // Salary Profile endpoints
  @Post('salary-profiles')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async createSalaryProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSalaryProfileDto,
  ) {
    // Log raw body to debug
    console.log(`[PayrollController] Raw DTO received:`, JSON.stringify(dto, null, 2));
    console.log(`[PayrollController] userId in DTO:`, dto.userId);
    
    // Check if userId might be coming as user_id (snake_case)
    const rawBody = dto as any;
    if (!dto.userId && rawBody.user_id) {
      console.log(`[PayrollController] Found user_id (snake_case), mapping to userId`);
      dto.userId = rawBody.user_id;
    }
    
    return this.payrollService.createSalaryProfile(
      user?.organizationId as string,
      dto,
    );
  }

  @Get('salary-profiles')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async listSalaryProfiles(@CurrentUser() user: AuthenticatedUser) {
    return this.payrollService.findAllSalaryProfiles(
      user?.organizationId as string,
    );
  }

  @Get('salary-profiles/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getSalaryProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.payrollService.findSalaryProfileById(
      user?.organizationId as string,
      id,
    );
  }

  // Payroll Run endpoints
  @Post('runs')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async createPayrollRun(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayrollRunDto,
  ) {
    return this.payrollService.createPayrollRun(
      user?.organizationId as string,
      user?.userId as string,
      dto,
    );
  }

  @Get('runs')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async listPayrollRuns(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: PayrollRunFilterDto,
  ) {
    return this.payrollService.findAllPayrollRuns(
      user?.organizationId as string,
      filters,
    );
  }

  @Get('runs/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getPayrollRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.payrollService.findPayrollRunById(
      user?.organizationId as string,
      id,
    );
  }

  @Put('salary-profiles/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async updateSalaryProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSalaryProfileDto,
  ) {
    return this.payrollService.updateSalaryProfile(
      user?.organizationId as string,
      id,
      dto,
    );
  }

  @Post('salary-profiles/bulk-update-users')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async bulkUpdateProfileUsers(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkUpdateProfilesDto,
  ) {
    return this.payrollService.bulkUpdateProfileUsers(
      user?.organizationId as string,
      dto.mappings,
    );
  }

  @Put('runs/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async updatePayrollRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePayrollRunDto,
  ) {
    return this.payrollService.updatePayrollRun(
      user?.organizationId as string,
      id,
      dto,
    );
  }

  @Post('runs/:id/process')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async processPayrollRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body?: { userIds?: string[] },
  ) {
    return this.payrollService.processPayrollRun(
      user?.organizationId as string,
      id,
      user?.userId as string,
      body?.userIds,
    );
  }

  @Post('runs/:id/cancel')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async cancelPayrollRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.payrollService.cancelPayrollRun(
      user?.organizationId as string,
      id,
    );
  }

  @Post('entries/:id/payslip')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async generatePayslip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.payrollService.generatePayslip(
      user?.organizationId as string,
      id,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=payslip-${id}.pdf`,
    );
    res.send(pdfBuffer);
  }

  @Post('entries/:id/payslip/send-email')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async sendPayslipEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.payrollService.sendPayslipEmail(
      user?.organizationId as string,
      id,
    );
    return { message: 'Payslip email sent successfully' };
  }

  @Post('runs/:id/send-payslip-emails')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async sendBulkPayslipEmails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.payrollService.sendBulkPayslipEmails(
      user?.organizationId as string,
      id,
    );
  }

  @Get('entries/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getPayrollEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.payrollService.findPayrollEntryById(
      user?.organizationId as string,
      id,
    );
  }

  @Get('reports/summary')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getPayrollSummaryReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: PayrollReportFilterDto,
  ) {
    return this.payrollService.getPayrollSummaryReport(
      user?.organizationId as string,
      filters,
    );
  }

  @Get('reports/employee/:userId')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getEmployeePayrollHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Query() filters: PayrollReportFilterDto,
  ) {
    return this.payrollService.getEmployeePayrollHistory(
      user?.organizationId as string,
      userId,
      filters,
    );
  }
}
