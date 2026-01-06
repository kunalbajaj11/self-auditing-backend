import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaxRulesService } from './tax-rules.service';
import { TaxRulesController } from './tax-rules.controller';
import { TaxRule } from '../../entities/tax-rule.entity';
import { TaxBracket } from '../../entities/tax-bracket.entity';
import { TaxExemption } from '../../entities/tax-exemption.entity';
import { CategoryTaxRule } from '../../entities/category-tax-rule.entity';
import { Organization } from '../../entities/organization.entity';
import { Category } from '../../entities/category.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TaxRule,
      TaxBracket,
      TaxExemption,
      CategoryTaxRule,
      Organization,
      Category,
    ]),
  ],
  providers: [TaxRulesService],
  controllers: [TaxRulesController],
  exports: [TaxRulesService],
})
export class TaxRulesModule {}

