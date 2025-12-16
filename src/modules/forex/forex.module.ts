import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ForexRateService } from './forex-rate.service';
import { ExchangeRate } from '../../entities/exchange-rate.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ExchangeRate])],
  providers: [ForexRateService],
  exports: [ForexRateService],
})
export class ForexModule {}
