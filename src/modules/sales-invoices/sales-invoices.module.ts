import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SalesInvoicesService } from './sales-invoices.service';
import { SalesInvoicesController } from './sales-invoices.controller';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { InvoiceLineItem } from '../../entities/invoice-line-item.entity';
import { InvoicePayment } from '../../entities/invoice-payment.entity';
import { CreditNoteApplication } from '../../entities/credit-note-application.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesInvoice,
      InvoiceLineItem,
      InvoicePayment,
      CreditNoteApplication,
      Organization,
      User,
    ]),
    ScheduleModule.forRoot(),
    NotificationsModule,
  ],
  providers: [SalesInvoicesService],
  controllers: [SalesInvoicesController],
  exports: [SalesInvoicesService],
})
export class SalesInvoicesModule {}

