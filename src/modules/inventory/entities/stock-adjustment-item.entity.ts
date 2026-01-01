import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../../../entities/abstract.entity';
import { StockAdjustment } from './stock-adjustment.entity';
import { Product } from '../../products/product.entity';

@Entity({ name: 'stock_adjustment_items' })
export class StockAdjustmentItem extends AbstractEntity {
  @ManyToOne(
    () => StockAdjustment,
    (adjustment) => adjustment.adjustmentItems,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'adjustment_id' })
  adjustment: StockAdjustment;

  @ManyToOne(() => Product, {
    nullable: false,
  })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({
    name: 'quantity_before',
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  quantityBefore: string;

  @Column({
    name: 'quantity_after',
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  quantityAfter: string;

  @Column({
    name: 'quantity_change',
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  quantityChange: string; // Calculated: after - before

  @Column({
    name: 'unit_cost',
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  unitCost: string;

  @Column({
    name: 'total_cost',
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  totalCost: string; // quantityChange * unitCost
}
