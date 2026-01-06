import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { TaxRule } from './tax-rule.entity';
import { Category } from './category.entity';

@Entity({ name: 'category_tax_rules' })
@Index(['taxRule', 'category'])
@Index(['category', 'isActive'])
export class CategoryTaxRule extends AbstractEntity {
  @ManyToOne(() => TaxRule, (rule) => rule.categoryRules, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tax_rule_id' })
  taxRule: TaxRule;

  @ManyToOne(() => Category, { nullable: false })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  rate: string; // Tax rate for this category

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  description?: string | null;
}

