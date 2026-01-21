import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { TaxRule } from './tax-rule.entity';

@Entity({ name: 'tax_brackets' })
@Index(['taxRule', 'minAmount'])
export class TaxBracket extends AbstractEntity {
  @ManyToOne(() => TaxRule, (rule) => rule.brackets, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tax_rule_id' })
  taxRule: TaxRule;

  @Column({ name: 'min_amount', type: 'decimal', precision: 12, scale: 2 })
  minAmount: string; // Minimum amount for this bracket

  @Column({
    name: 'max_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  maxAmount?: string | null; // null = no upper limit

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  rate: string; // Tax rate percentage

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'bracket_order', type: 'int', default: 0 })
  bracketOrder: number; // Order for progressive tax calculation
}
