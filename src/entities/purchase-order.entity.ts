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
import { Vendor } from '../modules/vendors/vendor.entity';
import { PurchaseOrderStatus } from '../common/enums/purchase-order-status.enum';
import { PurchaseOrderLineItem } from './purchase-order-line-item.entity';
import { Expense } from './expense.entity';

@Entity({ name: 'purchase_orders' })
@Unique(['organization', 'poNumber'])
@Index(['organization', 'poDate'])
@Index(['organization', 'status'])
@Index(['vendor'])
export class PurchaseOrder extends AbstractEntity {
  @ManyToOne(() => Organization, (organization) => organization.purchaseOrders, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User, (user) => user.purchaseOrders, {
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: User; // Created by

  @Column({ name: 'po_number', length: 100 })
  poNumber: string; // Auto-generated: PO-2026-001

  @ManyToOne(() => Vendor, (vendor) => vendor.purchaseOrders, {
    nullable: true,
  })
  @JoinColumn({ name: 'vendor_id' })
  vendor?: Vendor | null;

  @Column({ name: 'vendor_name', length: 200, nullable: true })
  vendorName?: string | null; // For backward compatibility

  @Column({ name: 'vendor_trn', length: 50, nullable: true })
  vendorTrn?: string | null;

  @Column({ name: 'po_date', type: 'date' })
  poDate: string;

  @Column({ name: 'expected_delivery_date', type: 'date', nullable: true })
  expectedDeliveryDate?: string | null;

  @Column({
    type: 'enum',
    enum: PurchaseOrderStatus,
    default: PurchaseOrderStatus.DRAFT,
  })
  status: PurchaseOrderStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  totalAmount: string;

  @Column({ length: 10, default: 'AED' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ name: 'sent_date', type: 'timestamp', nullable: true })
  sentDate?: Date | null;

  @Column({ name: 'sent_to_email', length: 200, nullable: true })
  sentToEmail?: string | null;

  // Link to expenses when PO is fulfilled
  @OneToMany(() => Expense, (expense) => expense.purchaseOrder)
  linkedExpenses: Expense[];

  // Line items
  @OneToMany(() => PurchaseOrderLineItem, (item) => item.purchaseOrder, {
    cascade: true,
  })
  lineItems: PurchaseOrderLineItem[];
}
