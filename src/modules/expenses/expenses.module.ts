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
import { JournalEntriesModule } from '../journal-entries/journal-entries.module';
import { Vendor } from '../vendors/vendor.entity';

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
    ]),
    NotificationsModule,
    AttachmentsModule,
    ForexModule,
    DuplicatesModule,
    VendorsModule,
    LicenseKeysModule,
    SettingsModule,
    JournalEntriesModule,
  ],
  providers: [ExpensesService],
  controllers: [ExpensesController],
  exports: [ExpensesService],
})
export class ExpensesModule {}
