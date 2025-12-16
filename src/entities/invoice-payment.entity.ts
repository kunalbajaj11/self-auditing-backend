import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { SalesInvoice } from './sales-invoice.entity';
import { Organization } from './organization.entity';
import { PaymentMethod } from '../common/enums/payment-method.enum';

@Entity({ name: 'invoice_payments' })
@Index(['invoice'])
@Index(['organization', 'paymentDate'])
export class InvoicePayment extends AbstractEntity {
  @ManyToOne(() => SalesInvoice, (invoice) => invoice.payments, {
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

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  amount: string;

  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: PaymentMethod,
    nullable: true,
  })
  paymentMethod?: PaymentMethod | null;

  @Column({ name: 'reference_number', length: 100, nullable: true })
  referenceNumber?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;
}
