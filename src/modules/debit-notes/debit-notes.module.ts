import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DebitNotesService } from './debit-notes.service';
import { DebitNotesController } from './debit-notes.controller';
import { DebitNote } from '../../entities/debit-note.entity';
import { DebitNoteApplication } from '../../entities/debit-note-application.entity';
import { DebitNoteExpenseApplication } from '../../entities/debit-note-expense-application.entity';
import { SettingsModule } from '../settings/settings.module';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { Expense } from '../../entities/expense.entity';
import { Vendor } from '../vendors/vendor.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { SalesInvoicesModule } from '../sales-invoices/sales-invoices.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { ExpensePaymentsModule } from '../expense-payments/expense-payments.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DebitNote,
      DebitNoteApplication,
      DebitNoteExpenseApplication,
      SalesInvoice,
      Expense,
      Vendor,
      Organization,
      User,
    ]),
    forwardRef(() => SalesInvoicesModule),
    forwardRef(() => ExpensesModule),
    forwardRef(() => ExpensePaymentsModule),
    AuditLogsModule,
    SettingsModule,
  ],
  providers: [DebitNotesService],
  controllers: [DebitNotesController],
  exports: [DebitNotesService],
})
export class DebitNotesModule {}
