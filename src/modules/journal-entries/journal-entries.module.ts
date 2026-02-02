import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalEntry } from '../../entities/journal-entry.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { ExpensePayment } from '../../entities/expense-payment.entity';
import { JournalEntriesService } from './journal-entries.service';
import { JournalEntriesController } from './journal-entries.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { LicenseKeysModule } from '../license-keys/license-keys.module';
import { LicenseFeatureGuard } from '../../common/guards/license-feature.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      JournalEntry,
      Organization,
      User,
      ExpensePayment,
    ]),
    AuditLogsModule,
    LicenseKeysModule,
  ],
  controllers: [JournalEntriesController],
  providers: [JournalEntriesService, LicenseFeatureGuard],
  exports: [JournalEntriesService],
})
export class JournalEntriesModule {}
