import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { SalesInvoice } from './sales-invoice.entity';
import { Product } from '../modules/products/product.entity';
import { Organization } from './organization.entity';
import { VatTaxType } from '../common/enums/vat-tax-type.enum';

@Entity({ name: 'invoice_line_items' })
@Index(['invoice'])
@Index(['organization', 'invoice'])
export class InvoiceLineItem extends AbstractEntity {
  @ManyToOne(() => SalesInvoice, (invoice) => invoice.lineItems, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'invoice_id' })
  invoice: SalesInvoice;

  @ManyToOne(() => Organization, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => Product, {
    nullable: true,
  })
  @JoinColumn({ name: 'product_id' })
  product?: Product | null;

  @Column({ name: 'item_name', length: 255 })
  itemName: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 3, default: 1 })
  quantity: string;

  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2 })
  unitPrice: string;

  @Column({ name: 'unit_of_measure', length: 20, nullable: true, default: 'unit' })
  unitOfMeasure?: string | null; // e.g., 'unit', 'kg', 'hour', 'day', 'm2'

  @Column({
    name: 'vat_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 5.0,
  })
  vatRate: string; // VAT rate percentage (e.g., 5.0 for 5%)

  @Column({
    name: 'vat_tax_type',
    type: 'varchar', // Use varchar instead of enum to avoid TypeORM synchronization issues
    length: 50,
    nullable: true,
    default: 'standard',
  })
  vatTaxType?: VatTaxType | null; // Tax type: STANDARD, ZERO_RATED, EXEMPT, REVERSE_CHARGE

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string; // quantity × unitPrice

  @Column({
    name: 'vat_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  vatAmount: string; // amount × (vatRate / 100)

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
  lineNumber: number; // Order of line items in invoice

  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId?: string | null; // Chart of Accounts link (for revenue tracking)
}

