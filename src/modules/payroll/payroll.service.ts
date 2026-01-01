import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EmployeeSalaryProfile } from './entities/employee-salary-profile.entity';
import { SalaryComponent } from './entities/salary-component.entity';
import { PayrollRun } from './entities/payroll-run.entity';
import { PayrollEntry } from './entities/payroll-entry.entity';
import { PayrollEntryDetail } from './entities/payroll-entry-detail.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { CreateSalaryProfileDto } from './dto/create-salary-profile.dto';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { UpdateSalaryProfileDto } from './dto/update-salary-profile.dto';
import { UpdatePayrollRunDto } from './dto/update-payroll-run.dto';
import { PayrollRunFilterDto } from './dto/payroll-run-filter.dto';
import { PayrollRunStatus } from '../../common/enums/payroll-run-status.enum';
import { SalaryComponentType } from '../../common/enums/salary-component-type.enum';
import { ComponentCalculationType } from '../../common/enums/component-calculation-type.enum';
import { JournalEntryAccount } from '../../common/enums/journal-entry-account.enum';
import { VatTaxType } from '../../common/enums/vat-tax-type.enum';
import { PayslipGeneratorService } from './payslip-generator.service';
import { TaxCalculationService } from './tax-calculation.service';
import { EmailService } from '../notifications/email.service';
import { JournalEntriesService } from '../journal-entries/journal-entries.service';
import { ExpensesService } from '../expenses/expenses.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { ExpenseType } from '../../common/enums/expense-type.enum';
import { PayrollReportFilterDto } from './dto/payroll-report-filter.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(EmployeeSalaryProfile)
    private readonly salaryProfilesRepository: Repository<EmployeeSalaryProfile>,
    @InjectRepository(SalaryComponent)
    private readonly salaryComponentsRepository: Repository<SalaryComponent>,
    @InjectRepository(PayrollRun)
    private readonly payrollRunsRepository: Repository<PayrollRun>,
    @InjectRepository(PayrollEntry)
    private readonly payrollEntriesRepository: Repository<PayrollEntry>,
    @InjectRepository(PayrollEntryDetail)
    private readonly payrollEntryDetailsRepository: Repository<PayrollEntryDetail>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly payslipGeneratorService: PayslipGeneratorService,
    private readonly taxCalculationService: TaxCalculationService,
    private readonly emailService: EmailService,
    private readonly journalEntriesService: JournalEntriesService,
    private readonly expensesService: ExpensesService,
    private readonly auditLogsService: AuditLogsService,
    private readonly dataSource: DataSource,
  ) {}

  // Salary Profile methods
  async createSalaryProfile(
    organizationId: string,
    dto: CreateSalaryProfileDto,
  ): Promise<EmployeeSalaryProfile> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Validate: either userId or employeeName must be provided
    if (!dto.userId && !dto.employeeName) {
      throw new NotFoundException(
        'Either userId or employeeName must be provided',
      );
    }

    // If userId is provided, validate it exists
    let user: User | null = null;
    if (dto.userId) {
      user = await this.usersRepository.findOne({
        where: { id: dto.userId },
      });
      if (!user) {
        throw new NotFoundException('User not found');
      }
    }

    const profile = this.salaryProfilesRepository.create({
      organization: { id: organizationId },
      user: dto.userId ? { id: dto.userId } : null,
      employeeName: dto.employeeName || null,
      basicSalary: dto.basicSalary.toString(),
      currency: dto.currency || organization.currency,
      effectiveDate: dto.effectiveDate,
      endDate: dto.endDate,
      isActive: true,
    });

    const savedProfile = await this.salaryProfilesRepository.save(profile);

    // Save salary components if provided
    if (dto.salaryComponents && dto.salaryComponents.length > 0) {
      const components = dto.salaryComponents.map((comp) => {
        return this.salaryComponentsRepository.create({
          salaryProfile: { id: savedProfile.id } as EmployeeSalaryProfile,
          componentType: comp.componentType as any,
          name: comp.name,
          amount: comp.amount?.toString(),
          percentage: comp.percentage?.toString(),
          hourlyRate: comp.hourlyRate?.toString(),
          calculationType: comp.calculationType as any,
          isTaxable: comp.isTaxable !== undefined ? comp.isTaxable : true,
          priority: comp.priority || 0,
        });
      });
      await this.salaryComponentsRepository.save(components);
    }

    // Reload with relations
    return this.salaryProfilesRepository.findOne({
      where: { id: savedProfile.id },
      relations: ['salaryComponents'],
    }) as Promise<EmployeeSalaryProfile>;
  }

  async findAllSalaryProfiles(
    organizationId: string,
  ): Promise<EmployeeSalaryProfile[]> {
    return this.salaryProfilesRepository.find({
      where: {
        organization: { id: organizationId },
        isDeleted: false,
      },
      relations: ['user', 'salaryComponents'],
      order: { createdAt: 'DESC' },
    });
  }

  async findSalaryProfileById(
    organizationId: string,
    id: string,
  ): Promise<EmployeeSalaryProfile> {
    const profile = await this.salaryProfilesRepository.findOne({
      where: {
        id,
        organization: { id: organizationId },
        isDeleted: false,
      },
      relations: ['user', 'salaryComponents'],
    });

    if (!profile) {
      throw new NotFoundException('Salary profile not found');
    }

    return profile;
  }

  // Payroll Run methods
  async createPayrollRun(
    organizationId: string,
    userId: string,
    dto: CreatePayrollRunDto,
  ): Promise<PayrollRun> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const payrollRun = this.payrollRunsRepository.create({
      organization: { id: organizationId },
      createdBy: { id: userId },
      payrollPeriod: dto.payrollPeriod,
      payDate: dto.payDate,
      notes: dto.notes,
      currency: organization.currency,
    });

    return this.payrollRunsRepository.save(payrollRun);
  }

  async findAllPayrollRuns(
    organizationId: string,
    filters: PayrollRunFilterDto,
  ): Promise<PayrollRun[]> {
    const query = this.payrollRunsRepository
      .createQueryBuilder('run')
      .where('run.organization_id = :organizationId', { organizationId })
      .andWhere('run.is_deleted = false');

    if (filters.status) {
      query.andWhere('run.status = :status', { status: filters.status });
    }

    if (filters.payrollPeriod) {
      query.andWhere('run.payroll_period = :payrollPeriod', {
        payrollPeriod: filters.payrollPeriod,
      });
    }

    query.orderBy('run.created_at', 'DESC');

    return query.getMany();
  }

  async findPayrollRunById(
    organizationId: string,
    id: string,
  ): Promise<PayrollRun> {
    const run = await this.payrollRunsRepository.findOne({
      where: {
        id,
        organization: { id: organizationId },
        isDeleted: false,
      },
      relations: ['createdBy', 'payrollEntries', 'payrollEntries.user'],
    });

    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }

    return run;
  }

  // Update Salary Profile
  async updateSalaryProfile(
    organizationId: string,
    id: string,
    dto: UpdateSalaryProfileDto,
  ): Promise<EmployeeSalaryProfile> {
    const profile = await this.findSalaryProfileById(organizationId, id);

    if (dto.employeeName !== undefined) {
      profile.employeeName = dto.employeeName;
    }
    if (dto.basicSalary !== undefined) {
      profile.basicSalary = dto.basicSalary.toString();
    }
    if (dto.currency !== undefined) {
      profile.currency = dto.currency;
    }
    if (dto.effectiveDate !== undefined) {
      profile.effectiveDate = dto.effectiveDate;
    }
    if (dto.endDate !== undefined) {
      profile.endDate = dto.endDate;
    }
    if (dto.isActive !== undefined) {
      profile.isActive = dto.isActive;
    }

    await this.salaryProfilesRepository.save(profile);

    // Update salary components if provided
    if (dto.salaryComponents !== undefined) {
      // Delete existing components
      await this.salaryComponentsRepository.delete({
        salaryProfile: { id: profile.id },
      });

      // Create new components
      if (dto.salaryComponents.length > 0) {
        const components = dto.salaryComponents.map((comp) => {
          return this.salaryComponentsRepository.create({
            salaryProfile: { id: profile.id } as EmployeeSalaryProfile,
            componentType: comp.componentType as any,
            name: comp.name,
            amount: comp.amount?.toString(),
            percentage: comp.percentage?.toString(),
            hourlyRate: comp.hourlyRate?.toString(),
            calculationType: comp.calculationType as any,
            isTaxable: comp.isTaxable !== undefined ? comp.isTaxable : true,
            priority: comp.priority || 0,
          });
        });
        await this.salaryComponentsRepository.save(components);
      }
    }

    return this.findSalaryProfileById(organizationId, id);
  }

  // Update Payroll Run
  async updatePayrollRun(
    organizationId: string,
    id: string,
    dto: UpdatePayrollRunDto,
  ): Promise<PayrollRun> {
    const run = await this.findPayrollRunById(organizationId, id);

    if (run.status !== PayrollRunStatus.DRAFT) {
      throw new BadRequestException('Only draft payroll runs can be updated');
    }

    if (dto.payrollPeriod !== undefined) {
      run.payrollPeriod = dto.payrollPeriod;
    }
    if (dto.payDate !== undefined) {
      run.payDate = dto.payDate;
    }
    if (dto.notes !== undefined) {
      run.notes = dto.notes;
    }

    return this.payrollRunsRepository.save(run);
  }

  // Cancel Payroll Run
  async cancelPayrollRun(
    organizationId: string,
    id: string,
  ): Promise<PayrollRun> {
    const run = await this.findPayrollRunById(organizationId, id);

    if (run.status === PayrollRunStatus.PAID) {
      throw new BadRequestException('Cannot cancel a paid payroll run');
    }

    run.status = PayrollRunStatus.CANCELLED;
    return this.payrollRunsRepository.save(run);
  }

  // Process Payroll Run
  async processPayrollRun(
    organizationId: string,
    runId: string,
    currentUserId: string,
    userIds?: string[],
  ): Promise<PayrollRun> {
    const run = await this.findPayrollRunById(organizationId, runId);

    if (run.status !== PayrollRunStatus.DRAFT) {
      throw new BadRequestException('Only draft payroll runs can be processed');
    }

    // Convert payrollPeriod (e.g., "2024-01") to dates (first and last day of month)
    // Validate and parse payrollPeriod
    let payrollPeriodStartDate: string;
    let payrollPeriodEndDate: string;
    try {
      // payrollPeriod should be in format "YYYY-MM"
      const periodMatch = run.payrollPeriod.match(/^(\d{4})-(\d{2})$/);
      if (!periodMatch) {
        throw new BadRequestException(
          `Invalid payroll period format. Expected "YYYY-MM" (e.g., "2024-01"), got: ${run.payrollPeriod}`,
        );
      }
      const year = parseInt(periodMatch[1], 10);
      const month = parseInt(periodMatch[2], 10);

      // First day of month: "2024-01" -> "2024-01-01"
      payrollPeriodStartDate = `${run.payrollPeriod}-01`;

      // Last day of month: calculate based on month
      const lastDay = new Date(year, month, 0).getDate();
      payrollPeriodEndDate = `${run.payrollPeriod}-${lastDay.toString().padStart(2, '0')}`;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Invalid payroll period: ${run.payrollPeriod}. Expected format: "YYYY-MM" (e.g., "2024-01")`,
      );
    }

    // Get all active salary profiles for the organization
    // Profile is valid if:
    // 1. effectiveDate <= last day of payroll period (profile started before or during period)
    // 2. endDate IS NULL OR endDate >= first day of payroll period (profile hasn't ended or ends after period)
    const query = this.salaryProfilesRepository
      .createQueryBuilder('profile')
      .leftJoinAndSelect('profile.salaryComponents', 'components')
      .leftJoinAndSelect('profile.user', 'user')
      .where('profile.organization_id = :organizationId', { organizationId })
      .andWhere('profile.is_active = true')
      .andWhere('profile.is_deleted = false')
      .andWhere('profile.effective_date <= :payrollPeriodEndDate', {
        payrollPeriodEndDate,
      })
      .andWhere(
        '(profile.end_date IS NULL OR profile.end_date >= :payrollPeriodStartDate)',
        { payrollPeriodStartDate },
      );

    if (userIds && userIds.length > 0) {
      query.andWhere('profile.user_id IN (:...userIds)', { userIds });
    }

    const activeProfiles = await query
      .orderBy('components.priority', 'ASC')
      .getMany();

    if (activeProfiles.length === 0) {
      // Get all profiles for better error message
      const allProfiles = await this.salaryProfilesRepository.find({
        where: {
          organization: { id: organizationId },
          isDeleted: false,
        },
      });

      const activeCount = allProfiles.filter((p) => p.isActive).length;
      const inactiveCount = allProfiles.filter((p) => !p.isActive).length;

      let errorMessage = `No active salary profiles found for payroll period ${run.payrollPeriod}. `;
      if (allProfiles.length === 0) {
        errorMessage +=
          'No salary profiles exist. Please create a salary profile first.';
      } else if (activeCount === 0) {
        errorMessage += `Found ${inactiveCount} inactive profile(s). Please activate a salary profile.`;
      } else {
        errorMessage += `Found ${activeCount} active profile(s), but none are valid for this payroll period. `;
        errorMessage += `Check that profile effective dates are on or before ${payrollPeriodEndDate} `;
        errorMessage += `and end dates (if set) are on or after ${payrollPeriodStartDate}.`;
      }

      throw new BadRequestException(errorMessage);
    }

    const payrollEntries: PayrollEntry[] = [];
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    // Process each salary profile
    for (const profile of activeProfiles) {
      const calculation = await this.calculatePayrollEntry(
        profile,
        run.payrollPeriod,
      );

      const entry = this.payrollEntriesRepository.create({
        payrollRun: { id: run.id } as PayrollRun,
        user: profile.user ? { id: profile.user.id } : null,
        basicSalary: calculation.basicSalary.toString(),
        allowancesAmount: calculation.allowancesAmount.toString(),
        deductionsAmount: calculation.deductionsAmount.toString(),
        overtimeAmount: calculation.overtimeAmount.toString(),
        bonusAmount: calculation.bonusAmount.toString(),
        commissionAmount: calculation.commissionAmount.toString(),
        grossSalary: calculation.grossSalary.toString(),
        netSalary: calculation.netSalary.toString(),
        currency: profile.currency,
      });

      const savedEntry = await this.payrollEntriesRepository.save(entry);

      // Create entry details
      const entryDetails = calculation.details.map((detail) => {
        return this.payrollEntryDetailsRepository.create({
          payrollEntry: { id: savedEntry.id } as PayrollEntry,
          componentType: detail.componentType,
          componentName: detail.componentName,
          amount: detail.amount.toString(),
          isTaxable: detail.isTaxable,
        });
      });

      await this.payrollEntryDetailsRepository.save(entryDetails);

      payrollEntries.push(savedEntry);

      totalGross += calculation.grossSalary;
      totalDeductions += calculation.deductionsAmount;
      totalNet += calculation.netSalary;
    }

    // Update payroll run totals and status
    run.totalGrossAmount = totalGross.toFixed(2);
    run.totalDeductions = totalDeductions.toFixed(2);
    run.totalNetAmount = totalNet.toFixed(2);
    run.status = PayrollRunStatus.PROCESSED;

    const savedRun = await this.payrollRunsRepository.save(run);

    // Create journal entry for payroll
    try {
      await this.journalEntriesService.create(organizationId, currentUserId, {
        debitAccount: JournalEntryAccount.GENERAL_EXPENSE,
        creditAccount: JournalEntryAccount.ACCOUNTS_PAYABLE,
        amount: totalNet,
        entryDate: run.payDate,
        description: `Payroll for period ${run.payrollPeriod}`,
        referenceNumber: `PAYROLL-${run.payrollPeriod}`,
      });
    } catch (error) {
      console.error('Failed to create journal entry for payroll:', error);
      // Don't fail the payroll processing if journal entry fails
    }

    // Create expense record for payroll (for P&L reporting)
    try {
      const organization = await this.organizationsRepository.findOne({
        where: { id: organizationId },
      });

      await this.expensesService.create(organizationId, currentUserId, {
        type: ExpenseType.EXPENSE,
        amount: totalNet,
        vatAmount: 0,
        vatTaxType: VatTaxType.EXEMPT,
        expenseDate: run.payDate,
        vendorName: 'Payroll',
        description: `Payroll expense for period ${run.payrollPeriod}`,
        invoiceNumber: `PAYROLL-${run.payrollPeriod}`,
        currency: organization?.currency || 'AED',
        purchaseStatus: 'Purchase - Cash Paid',
      });
    } catch (error) {
      console.error('Failed to create expense record for payroll:', error);
      // Don't fail the payroll processing if expense creation fails
    }

    await this.auditLogsService.record({
      organizationId,
      userId: currentUserId,
      action: AuditAction.PAYROLL_PROCESSED,
      entityType: 'payroll_run',
      entityId: runId,
      changes: {
        payrollPeriod: run.payrollPeriod,
        totalGross: totalGross.toFixed(2),
        totalNet: totalNet.toFixed(2),
        employeeCount: payrollEntries.length,
      },
    });

    return this.findPayrollRunById(organizationId, runId);
  }

  // Calculate Payroll Entry
  private async calculatePayrollEntry(
    profile: EmployeeSalaryProfile,
    payrollPeriod: string,
  ): Promise<{
    basicSalary: number;
    allowancesAmount: number;
    deductionsAmount: number;
    overtimeAmount: number;
    bonusAmount: number;
    commissionAmount: number;
    grossSalary: number;
    netSalary: number;
    details: Array<{
      componentType: SalaryComponentType;
      componentName: string;
      amount: number;
      isTaxable: boolean;
    }>;
  }> {
    const basicSalary = parseFloat(profile.basicSalary);
    let allowancesAmount = 0;
    let deductionsAmount = 0;
    let overtimeAmount = 0;
    let bonusAmount = 0;
    let commissionAmount = 0;

    const details: Array<{
      componentType: SalaryComponentType;
      componentName: string;
      amount: number;
      isTaxable: boolean;
    }> = [];

    // Sort components by priority
    const sortedComponents = [...(profile.salaryComponents || [])].sort(
      (a, b) => a.priority - b.priority,
    );

    // Calculate each component
    for (const component of sortedComponents) {
      let amount = 0;

      switch (component.calculationType) {
        case ComponentCalculationType.FIXED:
          amount = parseFloat(component.amount || '0');
          break;

        case ComponentCalculationType.PERCENTAGE:
          const percentage = parseFloat(component.percentage || '0');
          amount = (basicSalary * percentage) / 100;
          break;

        case ComponentCalculationType.HOURLY:
          // For hourly, we need hours worked - for now, assume 0 (can be enhanced later)
          const hourlyRate = parseFloat(component.hourlyRate || '0');
          const hoursWorked = 0; // TODO: Get from timesheet or input
          amount = hourlyRate * hoursWorked;
          break;
      }

      details.push({
        componentType: component.componentType,
        componentName: component.name,
        amount,
        isTaxable: component.isTaxable,
      });

      // Categorize by component type
      switch (component.componentType) {
        case SalaryComponentType.ALLOWANCE:
          allowancesAmount += amount;
          break;
        case SalaryComponentType.DEDUCTION:
          deductionsAmount += amount;
          break;
        case SalaryComponentType.OVERTIME:
          overtimeAmount += amount;
          break;
        case SalaryComponentType.BONUS:
          bonusAmount += amount;
          break;
        case SalaryComponentType.COMMISSION:
          commissionAmount += amount;
          break;
      }
    }

    const grossSalary =
      basicSalary +
      allowancesAmount +
      overtimeAmount +
      bonusAmount +
      commissionAmount;
    const netSalary = grossSalary - deductionsAmount;

    return {
      basicSalary,
      allowancesAmount,
      deductionsAmount,
      overtimeAmount,
      bonusAmount,
      commissionAmount,
      grossSalary,
      netSalary,
      details,
    };
  }

  // Generate Payslip
  async generatePayslip(
    organizationId: string,
    entryId: string,
  ): Promise<Buffer> {
    const entry = await this.payrollEntriesRepository.findOne({
      where: {
        id: entryId,
        payrollRun: { organization: { id: organizationId } },
      },
      relations: ['payrollRun', 'user', 'payrollRun.organization'],
    });

    if (!entry) {
      throw new NotFoundException('Payroll entry not found');
    }

    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const pdfBuffer = await this.payslipGeneratorService.generatePayslipPDF(
      entry,
      entry.payrollRun,
      organization,
    );

    // Save PDF to file system (temporary - can be enhanced to use S3)
    const payslipsDir = path.join(process.cwd(), 'payslips');
    if (!fs.existsSync(payslipsDir)) {
      fs.mkdirSync(payslipsDir, { recursive: true });
    }

    const filename = `payslip-${entry.id}.pdf`;
    const filepath = path.join(payslipsDir, filename);
    fs.writeFileSync(filepath, pdfBuffer);

    // Update entry
    entry.payslipGenerated = true;
    // For now, store file path - can be enhanced to use attachment entity
    await this.payrollEntriesRepository.save(entry);

    return pdfBuffer;
  }

  // Send Payslip Email
  async sendPayslipEmail(
    organizationId: string,
    entryId: string,
  ): Promise<void> {
    const entry = await this.payrollEntriesRepository.findOne({
      where: {
        id: entryId,
        payrollRun: { organization: { id: organizationId } },
      },
      relations: ['payrollRun', 'user', 'payrollRun.organization'],
    });

    if (!entry) {
      throw new NotFoundException('Payroll entry not found');
    }

    if (!entry.user || !entry.user.email) {
      throw new BadRequestException(
        'Employee email not found. Cannot send payslip.',
      );
    }

    // Generate payslip if not already generated
    let pdfBuffer: Buffer;
    if (!entry.payslipGenerated) {
      pdfBuffer = await this.generatePayslip(organizationId, entryId);
    } else {
      // Read existing payslip
      const filename = `payslip-${entry.id}.pdf`;
      const filepath = path.join(process.cwd(), 'payslips', filename);
      if (fs.existsSync(filepath)) {
        pdfBuffer = fs.readFileSync(filepath);
      } else {
        pdfBuffer = await this.generatePayslip(organizationId, entryId);
      }
    }

    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });

    const employeeName = entry.user.name || entry.user.email;
    const emailSubject = `Your Payslip - ${entry.payrollRun.payrollPeriod}`;
    const emailHtml = this.buildPayslipEmailHtml(
      employeeName,
      organization?.name || 'Organization',
      entry.payrollRun.payrollPeriod,
      parseFloat(entry.netSalary).toFixed(2),
      entry.currency,
    );

    const emailSent = await this.emailService.sendEmail({
      to: entry.user.email,
      subject: emailSubject,
      html: emailHtml,
      attachments: [
        {
          filename: `Payslip_${entry.payrollRun.payrollPeriod}_${employeeName.replace(/\s+/g, '_')}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    if (emailSent) {
      entry.payslipEmailSent = true;
      entry.payslipEmailSentAt = new Date();
      await this.payrollEntriesRepository.save(entry);

      await this.auditLogsService.record({
        organizationId,
        userId: entry.user.id,
        action: AuditAction.PAYSLIP_EMAIL_SENT,
        entityType: 'payroll_entry',
        entityId: entryId,
        changes: {
          email: entry.user.email,
          payrollPeriod: entry.payrollRun.payrollPeriod,
        },
      });
    } else {
      throw new BadRequestException('Failed to send payslip email');
    }
  }

  // Send Bulk Payslip Emails
  async sendBulkPayslipEmails(
    organizationId: string,
    runId: string,
  ): Promise<{
    total: number;
    sent: number;
    failed: number;
    errors: Array<{ entryId: string; error: string }>;
  }> {
    const run = await this.findPayrollRunById(organizationId, runId);

    const entries = await this.payrollEntriesRepository.find({
      where: {
        payrollRun: { id: runId },
      },
      relations: ['user', 'payrollRun'],
    });

    const results = {
      total: entries.length,
      sent: 0,
      failed: 0,
      errors: [] as Array<{ entryId: string; error: string }>,
    };

    for (const entry of entries) {
      try {
        if (entry.payslipEmailSent) {
          results.sent++;
          continue;
        }

        await this.sendPayslipEmail(organizationId, entry.id);
        results.sent++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          entryId: entry.id,
          error: error.message || 'Unknown error',
        });
        console.error(
          `Failed to send payslip email for entry ${entry.id}:`,
          error,
        );
      }
    }

    return results;
  }

  // Find Payroll Entry by ID
  async findPayrollEntryById(
    organizationId: string,
    id: string,
  ): Promise<PayrollEntry> {
    const entry = await this.payrollEntriesRepository.findOne({
      where: {
        id,
        payrollRun: { organization: { id: organizationId } },
      },
      relations: [
        'payrollRun',
        'user',
        'entryDetails',
        'payrollRun.organization',
      ],
    });

    if (!entry) {
      throw new NotFoundException('Payroll entry not found');
    }

    return entry;
  }

  // Build Payslip Email HTML
  private buildPayslipEmailHtml(
    employeeName: string,
    organizationName: string,
    payrollPeriod: string,
    netSalary: string,
    currency: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            .highlight { font-size: 18px; font-weight: bold; color: #1976d2; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Payslip</h1>
            </div>
            <div class="content">
              <h2>Hello ${employeeName}!</h2>
              <p>Your payslip for <strong>${payrollPeriod}</strong> from <strong>${organizationName}</strong> is attached to this email.</p>
              <p>Net Salary: <span class="highlight">${currency} ${netSalary}</span></p>
              <p>Please find the detailed payslip PDF attached to this email for complete salary breakdown.</p>
              <p>If you have any questions regarding your payslip, please contact your HR department.</p>
              <p>Best regards,<br>${organizationName}</p>
            </div>
            <div class="footer">
              <p>This is an automated email from SelfAccounting.AI.</p>
              <p>Please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  // Payroll Summary Report
  async getPayrollSummaryReport(
    organizationId: string,
    filters: PayrollReportFilterDto,
  ): Promise<{
    summary: {
      totalRuns: number;
      totalGrossAmount: number;
      totalDeductions: number;
      totalNetAmount: number;
      averageNetPerEmployee: number;
      employeeCount: number;
    };
    runs: PayrollRun[];
    periodBreakdown: Array<{
      period: string;
      grossAmount: number;
      deductionsAmount: number;
      netAmount: number;
      employeeCount: number;
    }>;
  }> {
    const query = this.payrollRunsRepository
      .createQueryBuilder('run')
      .leftJoinAndSelect('run.payrollEntries', 'entries')
      .where('run.organization_id = :organizationId', { organizationId })
      .andWhere('run.is_deleted = false')
      .andWhere('run.status != :cancelled', {
        cancelled: PayrollRunStatus.CANCELLED,
      });

    if (filters.startDate) {
      query.andWhere('run.pay_date >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters.endDate) {
      query.andWhere('run.pay_date <= :endDate', { endDate: filters.endDate });
    }
    if (filters.payrollPeriod) {
      query.andWhere('run.payroll_period = :payrollPeriod', {
        payrollPeriod: filters.payrollPeriod,
      });
    }
    if (filters.status) {
      query.andWhere('run.status = :status', { status: filters.status });
    }

    const runs = await query.orderBy('run.pay_date', 'DESC').getMany();

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    let totalEmployees = 0;
    const periodMap = new Map<string, any>();

    for (const run of runs) {
      const gross = parseFloat(run.totalGrossAmount || '0');
      const deductions = parseFloat(run.totalDeductions || '0');
      const net = parseFloat(run.totalNetAmount || '0');
      const employeeCount = run.payrollEntries?.length || 0;

      totalGross += gross;
      totalDeductions += deductions;
      totalNet += net;
      totalEmployees += employeeCount;

      const period = run.payrollPeriod;
      if (periodMap.has(period)) {
        const existing = periodMap.get(period);
        existing.grossAmount += gross;
        existing.deductionsAmount += deductions;
        existing.netAmount += net;
        existing.employeeCount += employeeCount;
      } else {
        periodMap.set(period, {
          period,
          grossAmount: gross,
          deductionsAmount: deductions,
          netAmount: net,
          employeeCount,
        });
      }
    }

    const periodBreakdown = Array.from(periodMap.values()).sort((a, b) =>
      a.period.localeCompare(b.period),
    );

    return {
      summary: {
        totalRuns: runs.length,
        totalGrossAmount: totalGross,
        totalDeductions: totalDeductions,
        totalNetAmount: totalNet,
        averageNetPerEmployee:
          totalEmployees > 0 ? totalNet / totalEmployees : 0,
        employeeCount: totalEmployees,
      },
      runs,
      periodBreakdown,
    };
  }

  // Employee Payroll History
  async getEmployeePayrollHistory(
    organizationId: string,
    userId: string,
    filters?: PayrollReportFilterDto,
  ): Promise<{
    employee: {
      id: string;
      name: string;
      email: string;
    };
    totalGross: number;
    totalDeductions: number;
    totalNet: number;
    entries: Array<{
      id: string;
      payrollPeriod: string;
      payDate: string;
      basicSalary: number;
      allowancesAmount: number;
      deductionsAmount: number;
      overtimeAmount: number;
      bonusAmount: number;
      commissionAmount: number;
      grossSalary: number;
      netSalary: number;
      currency: string;
    }>;
  }> {
    const user = await this.usersRepository.findOne({
      where: { id: userId, organization: { id: organizationId } },
    });

    if (!user) {
      throw new NotFoundException('Employee not found');
    }

    const query = this.payrollEntriesRepository
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.payrollRun', 'run')
      .where('entry.user_id = :userId', { userId })
      .andWhere('run.organization_id = :organizationId', { organizationId })
      .andWhere('entry.is_deleted = false')
      .andWhere('run.is_deleted = false');

    if (filters?.startDate) {
      query.andWhere('run.pay_date >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters?.endDate) {
      query.andWhere('run.pay_date <= :endDate', { endDate: filters.endDate });
    }
    if (filters?.payrollPeriod) {
      query.andWhere('run.payroll_period = :payrollPeriod', {
        payrollPeriod: filters.payrollPeriod,
      });
    }

    const entries = await query.orderBy('run.pay_date', 'DESC').getMany();

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    const entryData = entries.map((entry) => {
      const gross = parseFloat(entry.grossSalary);
      const deductions = parseFloat(entry.deductionsAmount);
      const net = parseFloat(entry.netSalary);

      totalGross += gross;
      totalDeductions += deductions;
      totalNet += net;

      return {
        id: entry.id,
        payrollPeriod: entry.payrollRun.payrollPeriod,
        payDate: entry.payrollRun.payDate,
        basicSalary: parseFloat(entry.basicSalary),
        allowancesAmount: parseFloat(entry.allowancesAmount),
        deductionsAmount: parseFloat(entry.deductionsAmount),
        overtimeAmount: parseFloat(entry.overtimeAmount),
        bonusAmount: parseFloat(entry.bonusAmount),
        commissionAmount: parseFloat(entry.commissionAmount),
        grossSalary: gross,
        netSalary: net,
        currency: entry.currency,
      };
    });

    return {
      employee: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      totalGross,
      totalDeductions,
      totalNet,
      entries: entryData,
    };
  }
}
