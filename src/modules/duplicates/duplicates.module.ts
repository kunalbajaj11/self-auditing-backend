import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { Expense } from '../../entities/expense.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Expense])],
  providers: [DuplicateDetectionService],
  exports: [DuplicateDetectionService],
})
export class DuplicatesModule {}

