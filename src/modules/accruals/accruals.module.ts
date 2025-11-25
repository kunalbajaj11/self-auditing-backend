import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccrualsService } from './accruals.service';
import { AccrualsController } from './accruals.controller';
import { Accrual } from '../../entities/accrual.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Accrual])],
  providers: [AccrualsService],
  controllers: [AccrualsController],
  exports: [AccrualsService],
})
export class AccrualsModule {}

