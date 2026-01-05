import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { InventoryLocation } from './entities/inventory-location.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { StockAdjustment } from './entities/stock-adjustment.entity';
import { StockAdjustmentItem } from './entities/stock-adjustment-item.entity';
import { Product } from '../products/product.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PlanTypeGuard } from '../../common/guards/plan-type.guard';
import { LicenseKeysModule } from '../license-keys/license-keys.module';
import { LicenseFeatureGuard } from '../../common/guards/license-feature.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryLocation,
      StockMovement,
      StockAdjustment,
      StockAdjustmentItem,
      Product,
      Organization,
      User,
    ]),
    AuditLogsModule,
    LicenseKeysModule,
  ],
  providers: [InventoryService, LicenseFeatureGuard],
  controllers: [InventoryController],
  exports: [InventoryService],
})
export class InventoryModule {}
