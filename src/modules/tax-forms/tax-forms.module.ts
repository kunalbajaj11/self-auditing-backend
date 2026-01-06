import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaxFormsService } from './tax-forms.service';
import { TaxFormGeneratorService } from './tax-form-generator.service';
import { TaxFormsController } from './tax-forms.controller';
import { TaxForm } from '../../entities/tax-form.entity';
import { Organization } from '../../entities/organization.entity';
import { Expense } from '../../entities/expense.entity';
import { SalesInvoice } from '../../entities/sales-invoice.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TaxForm,
      Organization,
      Expense,
      SalesInvoice,
    ]),
  ],
  providers: [TaxFormsService, TaxFormGeneratorService],
  controllers: [TaxFormsController],
  exports: [TaxFormsService, TaxFormGeneratorService],
})
export class TaxFormsModule {}

