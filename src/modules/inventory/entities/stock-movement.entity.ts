import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { AbstractEntity } from '../../../entities/abstract.entity';
import { Organization } from '../../../entities/organization.entity';
import { Product } from '../../products/product.entity';
import { InventoryLocation } from './inventory-location.entity';
import { User } from '../../../entities/user.entity';
import { StockMovementType } from '../../../common/enums/stock-movement-type.enum';

@Entity({ name: 'stock_movements' })
@Index(['organization', 'product', 'isDeleted'])
@Index(['organization', 'movementType', 'isDeleted'])
export class StockMovement extends AbstractEntity {
  @ManyToOne(() => Organization, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => Product, {
    nullable: false,
  })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => InventoryLocation, {
    nullable: false,
  })
  @JoinColumn({ name: 'location_id' })
  location: InventoryLocation;

  @Column({
    name: 'movement_type',
    type: 'enum',
    enum: StockMovementType,
  })
  movementType: StockMovementType;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  quantity: string; // Positive for increase, negative for decrease

  @Column({
    name: 'unit_cost',
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  unitCost: string; // Cost per unit at time of movement

  @Column({
    name: 'total_cost',
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  totalCost: string; // quantity * unitCost

  @Column({ name: 'reference_type', length: 50, nullable: true })
  referenceType?: string | null; // e.g., "expense", "sales_invoice"

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId?: string | null; // FK to related entity

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @ManyToOne(() => User, {
    nullable: false,
  })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;
}
