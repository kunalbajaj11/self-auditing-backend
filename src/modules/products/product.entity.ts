import { Column, Entity, JoinColumn, ManyToOne, Index, Unique } from 'typeorm';
import { AbstractEntity } from '../../entities/abstract.entity';
import { Organization } from '../../entities/organization.entity';

@Entity({ name: 'products' })
@Unique(['organization', 'sku'])
@Index(['organization', 'isDeleted'])
@Index(['sku'])
export class Product extends AbstractEntity {
  @ManyToOne(() => Organization, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 100, nullable: true })
  sku?: string | null; // Stock Keeping Unit

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({
    name: 'unit_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  unitPrice?: string | null;

  @Column({ length: 20, nullable: true, default: 'unit' })
  unitOfMeasure?: string | null; // e.g., 'unit', 'kg', 'hour', 'day', 'm2'

  @Column({
    name: 'vat_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 5.0,
  })
  vatRate: string; // Default VAT rate percentage

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;
}
