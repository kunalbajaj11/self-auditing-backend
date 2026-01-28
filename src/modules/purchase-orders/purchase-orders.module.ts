import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrder } from '../../entities/purchase-order.entity';
import { PurchaseOrderLineItem } from '../../entities/purchase-order-line-item.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { Vendor } from '../vendors/vendor.entity';
import { Expense } from '../../entities/expense.entity';
import { PurchaseLineItem } from '../../entities/purchase-line-item.entity';
import { SettingsModule } from '../settings/settings.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { ReportsModule } from '../reports/reports.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PurchaseOrder,
      PurchaseOrderLineItem,
      Organization,
      User,
      Vendor,
      Expense,
      PurchaseLineItem,
    ]),
    SettingsModule,
    AuditLogsModule,
    ExpensesModule,
    ReportsModule,
    NotificationsModule,
  ],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
