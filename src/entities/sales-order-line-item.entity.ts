import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { SalesOrder } from './sales-order.entity';
import { Product } from '../modules/products/product.entity';
import { Organization } from './organization.entity';
import { VatTaxType } from '../common/enums/vat-tax-type.enum';

@Entity({ name: 'sales_order_line_items' })
@Index(['salesOrder', 'isDeleted'])
@Index(['organization', 'salesOrder', 'isDeleted'])
export class SalesOrderLineItem extends AbstractEntity {
  @ManyToOne(() => SalesOrder, (so) => so.lineItems, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder: SalesOrder;

  @ManyToOne(() => Organization, { nullable: false })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => Product, { nullable: true })
  @JoinColumn({ name: 'product_id' })
  product?: Product | null;

  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string | null;

  @Column({ name: 'item_name', length: 255 })
  itemName: string;

  @Column({ name: 'sku', length: 100, nullable: true })
  sku?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({
    name: 'ordered_quantity',
    type: 'decimal',
    precision: 10,
    scale: 3,
  })
  orderedQuantity: string;

  @Column({
    name: 'unit_of_measure',
    length: 20,
    nullable: true,
    default: 'unit',
  })
  unitOfMeasure?: string | null;

  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2 })
  unitPrice: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string; // orderedQuantity × unitPrice

  @Column({
    name: 'vat_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 5.0,
  })
  vatRate: string;

  @Column({
    name: 'vat_tax_type',
    type: 'varchar',
    length: 50,
    nullable: true,
    default: 'standard',
  })
  vatTaxType?: VatTaxType | null;

  @Column({
    name: 'vat_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  vatAmount: string;

  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    generatedType: 'STORED',
    asExpression: '"amount" + "vat_amount"',
  })
  totalAmount: string; // amount + vatAmount

  @Column({ name: 'line_number', type: 'int', default: 1 })
  lineNumber: number;
}
