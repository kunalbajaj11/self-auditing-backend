import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Expense } from './expense.entity';
import { Product } from '../modules/products/product.entity';
import { VatTaxType } from '../common/enums/vat-tax-type.enum';

@Entity({ name: 'purchase_line_items' })
@Index(['expense', 'isDeleted'])
@Index(['product', 'isDeleted'])
export class PurchaseLineItem extends AbstractEntity {
  @ManyToOne(() => Expense, (expense) => expense.lineItems, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'expense_id' })
  expense: Expense;

  @ManyToOne(() => Product, {
    nullable: true,
  })
  @JoinColumn({ name: 'product_id' })
  product?: Product | null;

  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string | null;

  @Column({ length: 200 })
  itemName: string; // Product name or custom item name

  @Column({ length: 100, nullable: true })
  sku?: string | null; // Product SKU if linked to product

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
  })
  quantity: string;

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
  amount: string; // quantity * unitPrice (before VAT)

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

