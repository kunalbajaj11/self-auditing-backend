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
import { SalesOrderStatus } from '../common/enums/sales-order-status.enum';
import { SalesOrderLineItem } from './sales-order-line-item.entity';
import { DeliveryChallan } from './delivery-challan.entity';

@Entity({ name: 'sales_orders' })
@Unique(['organization', 'soNumber'])
@Index(['organization', 'orderDate'])
@Index(['organization', 'status'])
@Index(['customer'])
export class SalesOrder extends AbstractEntity {
  @ManyToOne(
    () => Organization,
    (organization) => (organization as any).salesOrders,
    {
      nullable: false,
    },
  )
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User, (user) => (user as any).salesOrders, {
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: User; // created by

  @Column({ name: 'so_number', length: 100 })
  soNumber: string; // Auto-generated: SO-2026-001

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer | null;

  @Column({ name: 'customer_name', length: 200, nullable: true })
  customerName?: string | null; // Backward compatibility / manual entry

  @Column({ name: 'customer_trn', length: 50, nullable: true })
  customerTrn?: string | null;

  @Column({ name: 'order_date', type: 'date' })
  orderDate: string;

  @Column({ name: 'expected_delivery_date', type: 'date', nullable: true })
  expectedDeliveryDate?: string | null;

  @Column({
    type: 'enum',
    enum: SalesOrderStatus,
    default: SalesOrderStatus.DRAFT,
  })
  status: SalesOrderStatus;

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

  @OneToMany(() => SalesOrderLineItem, (item) => item.salesOrder, {
    cascade: true,
  })
  lineItems: SalesOrderLineItem[];

  @OneToMany(() => DeliveryChallan, (dc) => dc.salesOrder)
  deliveryChallans: DeliveryChallan[];
}
