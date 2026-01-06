import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { Expense } from '../../entities/expense.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { Category } from '../../entities/category.entity';
import { Attachment } from '../../entities/attachment.entity';
import { Accrual } from '../../entities/accrual.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { ForexModule } from '../forex/forex.module';
import { DuplicatesModule } from '../duplicates/duplicates.module';
import { VendorsModule } from '../vendors/vendors.module';
import { LicenseKeysModule } from '../license-keys/license-keys.module';
import { SettingsModule } from '../settings/settings.module';
import { Vendor } from '../vendors/vendor.entity';
import { Product } from '../products/product.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { TaxRulesModule } from '../tax-rules/tax-rules.module';
import { PurchaseLineItem } from '../../entities/purchase-line-item.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Expense,
      Organization,
      User,
      Category,
      Attachment,
      Accrual,
      Vendor,
      Product,
      PurchaseLineItem,
    ]),
    NotificationsModule,
    AttachmentsModule,
    ForexModule,
    DuplicatesModule,
    VendorsModule,
    LicenseKeysModule,
    SettingsModule,
    InventoryModule,
    TaxRulesModule,
  ],
  providers: [ExpensesService],
  controllers: [ExpensesController],
  exports: [ExpensesService],
})
export class ExpensesModule {}
