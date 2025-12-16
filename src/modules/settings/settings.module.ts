import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { OrganizationSettings } from '../../entities/organization-settings.entity';
import { TaxRate } from '../../entities/tax-rate.entity';
import { NumberingSequence } from '../../entities/numbering-sequence.entity';
import { ExchangeRate } from '../../entities/exchange-rate.entity';
import { Organization } from '../../entities/organization.entity';
import { ForexModule } from '../forex/forex.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrganizationSettings,
      TaxRate,
      NumberingSequence,
      ExchangeRate,
      Organization,
    ]),
    ForexModule,
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
