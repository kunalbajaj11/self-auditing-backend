import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { OrganizationSettings } from '../../entities/organization-settings.entity';
import { TaxRate } from '../../entities/tax-rate.entity';
import { NumberingSequence } from '../../entities/numbering-sequence.entity';
import { ExchangeRate } from '../../entities/exchange-rate.entity';
import { Organization } from '../../entities/organization.entity';
import { ForexModule } from '../forex/forex.module';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrganizationSettings,
      TaxRate,
      NumberingSequence,
      ExchangeRate,
      Organization,
    ]),
    forwardRef(() => ForexModule),
    AttachmentsModule,
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
