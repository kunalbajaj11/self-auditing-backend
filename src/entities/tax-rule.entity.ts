import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { Region } from '../common/enums/region.enum';
import { TaxBracket } from './tax-bracket.entity';
import { TaxExemption } from './tax-exemption.entity';
import { CategoryTaxRule } from './category-tax-rule.entity';

export enum TaxRuleType {
  BRACKET = 'bracket',
  EXEMPTION = 'exemption',
  CATEGORY = 'category',
  THRESHOLD = 'threshold',
  TIME_BASED = 'time_based',
}

export enum TaxRuleStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  EXPIRED = 'expired',
}

@Entity({ name: 'tax_rules' })
@Index(['organization', 'region', 'ruleType'])
@Index(['organization', 'isActive', 'effectiveDate'])
export class TaxRule extends AbstractEntity {
  @ManyToOne(() => Organization, { nullable: false })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'enum', enum: Region, nullable: true })
  region?: Region | null; // null = applies to all regions for this org

  @Column({ name: 'rule_type', type: 'enum', enum: TaxRuleType })
  ruleType: TaxRuleType;

  @Column({ name: 'rule_name', length: 200 })
  ruleName: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'rule_config', type: 'jsonb', nullable: true })
  ruleConfig?: Record<string, any> | null; // Flexible config for rule-specific data

  @Column({ name: 'effective_date', type: 'date', nullable: true })
  effectiveDate?: Date | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate?: Date | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({
    name: 'priority',
    type: 'int',
    default: 0,
    comment: 'Higher priority rules are applied first',
  })
  priority: number;

  // Relations
  @OneToMany(() => TaxBracket, (bracket) => bracket.taxRule, { cascade: true })
  brackets?: TaxBracket[];

  @OneToMany(() => TaxExemption, (exemption) => exemption.taxRule, {
    cascade: true,
  })
  exemptions?: TaxExemption[];

  @OneToMany(() => CategoryTaxRule, (categoryRule) => categoryRule.taxRule, {
    cascade: true,
  })
  categoryRules?: CategoryTaxRule[];
}
