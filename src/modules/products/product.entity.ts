import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  Index,
  Unique,
  OneToMany,
} from 'typeorm';
import { AbstractEntity } from '../../entities/abstract.entity';
import { Organization } from '../../entities/organization.entity';
import { StockValuationMethod } from '../../common/enums/stock-valuation-method.enum';

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

  // Inventory fields
  @Column({
    name: 'stock_quantity',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  stockQuantity: string;

  @Column({
    name: 'reorder_level',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  reorderLevel?: string | null;

  @Column({
    name: 'reorder_quantity',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  reorderQuantity?: string | null;

  @Column({
    name: 'cost_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  costPrice?: string | null; // For FIFO/LIFO

  @Column({
    name: 'average_cost',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  averageCost?: string | null; // For Average Cost

  @Column({
    name: 'valuation_method',
    type: 'enum',
    enum: StockValuationMethod,
    default: StockValuationMethod.AVERAGE,
  })
  valuationMethod: StockValuationMethod;

  @Column({ length: 100, nullable: true })
  category?: string | null;

  @Column({ length: 100, nullable: true })
  barcode?: string | null;

  @Column({ name: 'location_id', type: 'uuid', nullable: true })
  locationId?: string | null;

  // Note: OneToMany relationship defined in StockMovement entity to avoid circular import
  // Access stock movements via repository queries instead of direct property access
}
