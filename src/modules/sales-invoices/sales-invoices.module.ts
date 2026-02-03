import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SalesInvoicesService } from './sales-invoices.service';
import { SalesInvoicesController } from './sales-invoices.controller';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { InvoiceLineItem } from '../../entities/invoice-line-item.entity';
import { InvoicePayment } from '../../entities/invoice-payment.entity';
import { CreditNoteApplication } from '../../entities/credit-note-application.entity';
import { CreditNote } from '../../entities/credit-note.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { Customer } from '../customers/customer.entity';
import { Product } from '../products/product.entity';
import { PurchaseLineItem } from '../../entities/purchase-line-item.entity';
import { Expense } from '../../entities/expense.entity';
import { InvoiceHash } from '../../entities/invoice-hash.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsModule } from '../reports/reports.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SettingsModule } from '../settings/settings.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesInvoice,
      InvoiceLineItem,
      InvoicePayment,
      CreditNoteApplication,
      CreditNote,
      Organization,
      User,
      Customer,
      Product,
      PurchaseLineItem,
      Expense,
      InvoiceHash,
    ]),
    ScheduleModule.forRoot(),
    NotificationsModule,
    ReportsModule,
    AuditLogsModule,
    SettingsModule,
    InventoryModule,
  ],
  providers: [SalesInvoicesService],
  controllers: [SalesInvoicesController],
  exports: [SalesInvoicesService],
})
export class SalesInvoicesModule {}
