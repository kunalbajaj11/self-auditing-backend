import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpenseTypesService } from './expense-types.service';
import { ExpenseTypesController } from './expense-types.controller';
import { ExpenseType } from '../../entities/expense-type.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { Expense } from '../../entities/expense.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExpenseType, Organization, User, Expense]),
  ],
  providers: [ExpenseTypesService],
  controllers: [ExpenseTypesController],
  exports: [ExpenseTypesService],
})
export class ExpenseTypesModule {}

