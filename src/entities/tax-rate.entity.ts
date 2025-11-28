import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';

export enum TaxRateType {
  STANDARD = 'standard',
  REDUCED = 'reduced',
  ZERO = 'zero',
  EXEMPT = 'exempt',
}

@Entity({ name: 'tax_rates' })
@Index(['organization', 'code'], { unique: true })
export class TaxRate extends AbstractEntity {
  @ManyToOne(() => Organization, { nullable: false })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ length: 20 })
  code: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  rate: number;

  @Column({
    type: 'enum',
    enum: TaxRateType,
    default: TaxRateType.STANDARD,
  })
  type: TaxRateType;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}

