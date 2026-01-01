import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { PayslipGeneratorService } from './payslip-generator.service';
import { TaxCalculationService } from './tax-calculation.service';
import { EmployeeSalaryProfile } from './entities/employee-salary-profile.entity';
import { SalaryComponent } from './entities/salary-component.entity';
import { PayrollRun } from './entities/payroll-run.entity';
import { PayrollEntry } from './entities/payroll-entry.entity';
import { PayrollEntryDetail } from './entities/payroll-entry-detail.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { JournalEntriesModule } from '../journal-entries/journal-entries.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { PlanTypeGuard } from '../../common/guards/plan-type.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployeeSalaryProfile,
      SalaryComponent,
      PayrollRun,
      PayrollEntry,
      PayrollEntryDetail,
      Organization,
      User,
    ]),
    NotificationsModule,
    AttachmentsModule,
    AuditLogsModule,
    JournalEntriesModule,
    ExpensesModule,
  ],
  providers: [PayrollService, PayslipGeneratorService, TaxCalculationService],
  controllers: [PayrollController],
  exports: [PayrollService],
})
export class PayrollModule {}
