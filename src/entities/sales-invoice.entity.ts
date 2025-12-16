import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Index,
  Unique,
} from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { Customer } from '../modules/customers/customer.entity';
import { InvoiceStatus } from '../common/enums/invoice-status.enum';
import { PaymentStatus } from '../common/enums/payment-status.enum';
import { InvoicePayment } from './invoice-payment.entity';
import { InvoiceLineItem } from './invoice-line-item.entity';
import { CreditNoteApplication } from './credit-note-application.entity';

@Entity({ name: 'sales_invoices' })
@Unique(['organization', 'invoiceNumber'])
@Index(['organization', 'invoiceDate'])
@Index(['organization', 'status', 'paymentStatus'])
@Index(['customer'])
@Index(['publicToken'])
export class SalesInvoice extends AbstractEntity {
  @ManyToOne(() => Organization, (organization) => organization.salesInvoices, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User, (user) => user.salesInvoices, {
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'invoice_number', length: 100 })
  invoiceNumber: string;

  @ManyToOne(() => Customer, (customer) => customer.invoices, {
    nullable: true,
  })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer | null;

  @Column({ name: 'customer_name', length: 200, nullable: true })
  customerName?: string | null; // For backward compatibility

  @Column({ name: 'customer_trn', length: 50, nullable: true })
  customerTrn?: string | null;

  @Column({ name: 'invoice_date', type: 'date' })
  invoiceDate: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate?: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

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
  totalAmount: string;

  @Column({ length: 10, default: 'AED' })
  currency: string;

  @Column({
    name: 'exchange_rate',
    type: 'decimal',
    precision: 12,
    scale: 6,
    nullable: true,
  })
  exchangeRate?: string | null;

  @Column({
    name: 'base_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  baseAmount?: string | null;

  @Column({
    name: 'fx_gain_loss',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  fxGainLoss?: string | null;

  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    default: InvoiceStatus.DRAFT,
  })
  status: InvoiceStatus;

  @Column({
    name: 'payment_status',
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.UNPAID,
  })
  paymentStatus: PaymentStatus;

  @Column({
    name: 'paid_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  paidAmount: string;

  @Column({ name: 'paid_date', type: 'date', nullable: true })
  paidDate?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @OneToMany(() => InvoicePayment, (payment) => payment.invoice)
  payments: InvoicePayment[];

  @OneToMany(() => InvoiceLineItem, (lineItem) => lineItem.invoice, {
    cascade: true,
  })
  lineItems: InvoiceLineItem[];

  @OneToMany(() => CreditNoteApplication, (application) => application.invoice)
  creditNoteApplications: CreditNoteApplication[];

  @Column({ name: 'public_token', length: 64, nullable: true, unique: true })
  publicToken?: string | null; // Token for public invoice viewing
}
