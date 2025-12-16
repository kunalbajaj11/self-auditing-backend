import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankReconciliationController } from './bank-reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationReportService } from './reconciliation-report.service';
import { BankStatementParserService } from './bank-statement-parser.service';
import { BankTransaction } from '../../entities/bank-transaction.entity';
import { SystemTransaction } from '../../entities/system-transaction.entity';
import { ReconciliationRecord } from '../../entities/reconciliation-record.entity';
import { Expense } from '../../entities/expense.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { Category } from '../../entities/category.entity';
import { AttachmentsModule } from '../attachments/attachments.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { EnterpriseLicenseGuard } from '../../common/guards/enterprise-license.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BankTransaction,
      SystemTransaction,
      ReconciliationRecord,
      Expense,
      Organization,
      User,
      Category,
    ]),
    AttachmentsModule,
    ExpensesModule,
  ],
  controllers: [BankReconciliationController],
  providers: [
    ReconciliationService,
    ReconciliationReportService,
    BankStatementParserService,
    EnterpriseLicenseGuard,
  ],
  exports: [ReconciliationService, ReconciliationReportService],
})
export class BankReconciliationModule {}
