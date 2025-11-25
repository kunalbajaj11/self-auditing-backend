import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { EnterpriseLicenseGuard } from '../../common/guards/enterprise-license.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationReportService } from './reconciliation-report.service';
import { UploadStatementDto } from './dto/upload-statement.dto';
import { MatchTransactionsDto } from './dto/match-transactions.dto';
import { ManualEntryDto } from './dto/manual-entry.dto';
import { ReconciliationFilterDto } from './dto/reconciliation-filter.dto';

@Controller('bank-reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, EnterpriseLicenseGuard)
export class BankReconciliationController {
  constructor(
    private readonly reconciliationService: ReconciliationService,
    private readonly reportService: ReconciliationReportService,
  ) {}

  @Post('upload')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseInterceptors(FileInterceptor('file'))
  async uploadStatement(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadStatementDto,
  ) {
    if (!file) {
      throw new Error('File is required');
    }

    return this.reconciliationService.uploadAndParseStatement(
      user?.organizationId as string,
      user?.userId as string,
      file,
      dto.statementPeriodStart,
      dto.statementPeriodEnd,
    );
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPERADMIN)
  async listReconciliations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: ReconciliationFilterDto,
  ) {
    return this.reconciliationService.getReconciliationRecords(
      user?.organizationId as string,
      filters,
    );
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPERADMIN)
  async getReconciliationDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.reconciliationService.getReconciliationDetail(
      user?.organizationId as string,
      id,
    );
  }

  @Post('match')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async matchTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MatchTransactionsDto,
  ) {
    await this.reconciliationService.manualMatch(
      user?.organizationId as string,
      dto,
    );
    return { message: 'Transactions matched successfully' };
  }

  @Post('manual-entry')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async createManualEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ManualEntryDto & { reconciliationRecordId: string },
  ) {
    return this.reconciliationService.createManualEntry(
      user?.organizationId as string,
      user?.userId as string,
      dto.reconciliationRecordId,
      dto,
    );
  }

  @Get('report/:id/pdf')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPERADMIN)
  async downloadPDFReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.reportService.generatePDFReport(
      user?.organizationId as string,
      id,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="bank-reconciliation-${id}.pdf"`,
    );
    res.send(pdfBuffer);
  }

  @Get('report/:id/excel')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPERADMIN)
  async downloadExcelReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const excelBuffer = await this.reportService.generateExcelReport(
      user?.organizationId as string,
      id,
    );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="bank-reconciliation-${id}.xlsx"`,
    );
    res.send(excelBuffer);
  }
}

