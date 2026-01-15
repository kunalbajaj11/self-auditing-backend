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
import { ExpensePayment } from '../../entities/expense-payment.entity';
import { InvoicePayment } from '../../entities/invoice-payment.entity';
import { JournalEntry } from '../../entities/journal-entry.entity';
import { CreditNote } from '../../entities/credit-note.entity';
import { DebitNote } from '../../entities/debit-note.entity';
import { CreditNoteApplication } from '../../entities/credit-note-application.entity';
import { DebitNoteApplication } from '../../entities/debit-note-application.entity';
import { DebitNoteExpenseApplication } from '../../entities/debit-note-expense-application.entity';
import { Product } from '../products/product.entity';
import { StockMovement } from '../inventory/entities/stock-movement.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Expense,
      Accrual,
      Report,
      Organization,
      SalesInvoice,
      User,
      ExpensePayment,
      InvoicePayment,
      JournalEntry,
      CreditNote,
      DebitNote,
      CreditNoteApplication,
      DebitNoteApplication,
      DebitNoteExpenseApplication,
      Product,
      StockMovement,
    ]),
    NotificationsModule,
    SettingsModule,
  ],
  providers: [ReportsService, ReportGeneratorService],
  controllers: [ReportsController],
  exports: [ReportsService, ReportGeneratorService],
})
export class ReportsModule {}
