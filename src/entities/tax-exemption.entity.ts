import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { TaxRule } from './tax-rule.entity';
import { Category } from './category.entity';

export enum ExemptionType {
  CATEGORY = 'category',
  AMOUNT_THRESHOLD = 'amount_threshold',
  PRODUCT = 'product',
  VENDOR = 'vendor',
  FULL = 'full',
  PARTIAL = 'partial',
}

@Entity({ name: 'tax_exemptions' })
@Index(['taxRule', 'exemptionType'])
export class TaxExemption extends AbstractEntity {
  @ManyToOne(() => TaxRule, (rule) => rule.exemptions, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tax_rule_id' })
  taxRule: TaxRule;

  @Column({
    name: 'exemption_type',
    type: 'enum',
    enum: ExemptionType,
  })
  exemptionType: ExemptionType;

  @ManyToOne(() => Category, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category?: Category | null;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId?: string | null;

  @Column({
    name: 'exemption_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  exemptionAmount?: string | null; // For partial exemptions

  @Column({
    name: 'exemption_percentage',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  exemptionPercentage?: string | null; // For partial exemptions

  @Column({ name: 'threshold_amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  thresholdAmount?: string | null; // Amount threshold for exemption

  @Column({ type: 'text', nullable: true })
  description?: string | null;
}

