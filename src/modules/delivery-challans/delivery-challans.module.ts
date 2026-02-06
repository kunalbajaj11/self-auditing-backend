import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryChallansService } from './delivery-challans.service';
import { DeliveryChallansController } from './delivery-challans.controller';
import { DeliveryChallan } from '../../entities/delivery-challan.entity';
import { DeliveryChallanLineItem } from '../../entities/delivery-challan-line-item.entity';
import { SalesOrder } from '../../entities/sales-order.entity';
import { SalesOrderLineItem } from '../../entities/sales-order-line-item.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { Customer } from '../customers/customer.entity';
import { Product } from '../products/product.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { SettingsModule } from '../settings/settings.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ReportsModule } from '../reports/reports.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StockMovement } from '../inventory/entities/stock-movement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeliveryChallan,
      DeliveryChallanLineItem,
      SalesOrder,
      SalesOrderLineItem,
      Organization,
      User,
      Customer,
      Product,
      StockMovement,
    ]),
    InventoryModule,
    SettingsModule,
    AuditLogsModule,
    ReportsModule,
    NotificationsModule,
  ],
  providers: [DeliveryChallansService],
  controllers: [DeliveryChallansController],
  exports: [DeliveryChallansService],
})
export class DeliveryChallansModule {}
