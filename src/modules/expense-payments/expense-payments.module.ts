import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpensePaymentsService } from './expense-payments.service';
import { ExpensePaymentsController } from './expense-payments.controller';
import { ExpensePayment } from '../../entities/expense-payment.entity';
import { Expense } from '../../entities/expense.entity';
import { Organization } from '../../entities/organization.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExpensePayment, Expense, Organization]),
  ],
  providers: [ExpensePaymentsService],
  controllers: [ExpensePaymentsController],
  exports: [ExpensePaymentsService],
})
export class ExpensePaymentsModule {}

