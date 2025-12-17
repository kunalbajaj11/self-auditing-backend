import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ForexRateService } from './forex-rate.service';
import { ExchangeRate } from '../../entities/exchange-rate.entity';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExchangeRate]),
    forwardRef(() => SettingsModule),
  ],
  providers: [ForexRateService],
  exports: [ForexRateService],
})
export class ForexModule {}
