import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SalesInvoicesService } from './sales-invoices.service';
import { SalesInvoicesController } from './sales-invoices.controller';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { InvoiceLineItem } from '../../entities/invoice-line-item.entity';
import { InvoicePayment } from '../../entities/invoice-payment.entity';
import { CreditNoteApplication } from '../../entities/credit-note-application.entity';
import { InvoiceNumberSequence } from '../../entities/invoice-number-sequence.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { Customer } from '../customers/customer.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsModule } from '../reports/reports.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesInvoice,
      InvoiceLineItem,
      InvoicePayment,
      CreditNoteApplication,
      InvoiceNumberSequence,
      Organization,
      User,
      Customer,
    ]),
    ScheduleModule.forRoot(),
    NotificationsModule,
    ReportsModule,
    AuditLogsModule,
  ],
  providers: [SalesInvoicesService],
  controllers: [SalesInvoicesController],
  exports: [SalesInvoicesService],
})
export class SalesInvoicesModule {}
