import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { Product } from '../modules/products/product.entity';
import { VatTaxType } from '../common/enums/vat-tax-type.enum';

@Entity({ name: 'purchase_order_line_items' })
@Index(['purchaseOrder', 'isDeleted'])
@Index(['product', 'isDeleted'])
export class PurchaseOrderLineItem extends AbstractEntity {
  @ManyToOne(() => PurchaseOrder, (po) => po.lineItems, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purchase_order_id' })
  purchaseOrder: PurchaseOrder;

  @ManyToOne(() => Product, {
    nullable: true,
  })
  @JoinColumn({ name: 'product_id' })
  product?: Product | null;

  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string | null;

  @Column({ name: 'item_name', length: 200 })
  itemName: string; // Product name or custom item name

  @Column({ length: 100, nullable: true })
  sku?: string | null; // Product SKU if linked to product

  @Column({
    name: 'ordered_quantity',
    type: 'decimal',
    precision: 12,
    scale: 3,
  })
  orderedQuantity: string; // Quantity ordered

  @Column({
    name: 'received_quantity',
    type: 'decimal',
    precision: 12,
    scale: 3,
    default: 0,
  })
  receivedQuantity: string; // Quantity received so far

  @Column({ length: 20, nullable: true, default: 'unit' })
  unitOfMeasure?: string | null; // e.g., 'unit', 'kg', 'hour', 'day', 'm2'

  @Column({
    name: 'unit_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  unitPrice: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  amount: string; // orderedQuantity * unitPrice (before VAT)

  @Column({
    name: 'vat_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  vatRate: string; // VAT rate percentage

  @Column({
    name: 'vat_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  vatAmount: string;

  @Column({
    name: 'vat_tax_type',
    type: 'varchar',
    length: 50,
    nullable: true,
    default: 'standard',
  })
  vatTaxType?: VatTaxType | null;

  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    generatedType: 'STORED',
    asExpression: '"amount" + "vat_amount"',
  })
  totalAmount: string; // amount + vatAmount

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'line_number', type: 'integer', default: 1 })
  lineNumber: number; // Order of line items
}
