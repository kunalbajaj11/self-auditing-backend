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
import { SalesOrder } from './sales-order.entity';
import { DeliveryChallanStatus } from '../common/enums/delivery-challan-status.enum';
import { DeliveryChallanLineItem } from './delivery-challan-line-item.entity';

@Entity({ name: 'delivery_challans' })
@Unique(['organization', 'challanNumber'])
@Index(['organization', 'challanDate'])
@Index(['organization', 'status'])
@Index(['customer'])
@Index(['salesOrder'])
export class DeliveryChallan extends AbstractEntity {
  @ManyToOne(
    () => Organization,
    (organization) => (organization as any).deliveryChallans,
    { nullable: false },
  )
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User, (user) => (user as any).deliveryChallans, {
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: User; // created by

  @Column({ name: 'challan_number', length: 100 })
  challanNumber: string; // Auto-generated: DC-2026-001

  @Column({ name: 'challan_date', type: 'date' })
  challanDate: string;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer | null;

  @Column({ name: 'customer_name', length: 200, nullable: true })
  customerName?: string | null;

  @Column({ name: 'customer_trn', length: 50, nullable: true })
  customerTrn?: string | null;

  @ManyToOne(() => SalesOrder, (so) => so.deliveryChallans, {
    nullable: true,
  })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder?: SalesOrder | null;

  @Column({ name: 'sales_order_id', type: 'uuid', nullable: true })
  salesOrderId?: string | null;

  @Column({
    type: 'enum',
    enum: DeliveryChallanStatus,
    default: DeliveryChallanStatus.DRAFT,
  })
  status: DeliveryChallanStatus;

  // Delivery / transport fields (common in challans)
  @Column({ name: 'delivery_address', type: 'text', nullable: true })
  deliveryAddress?: string | null;

  @Column({ name: 'vehicle_number', length: 50, nullable: true })
  vehicleNumber?: string | null;

  @Column({ name: 'transport_mode', length: 100, nullable: true })
  transportMode?: string | null; // e.g., "By Road"

  @Column({ name: 'lr_number', length: 100, nullable: true })
  lrNumber?: string | null;

  @Column({ name: 'dispatched_at', type: 'timestamp', nullable: true })
  dispatchedAt?: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamp', nullable: true })
  deliveredAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @OneToMany(() => DeliveryChallanLineItem, (item) => item.deliveryChallan, {
    cascade: true,
  })
  lineItems: DeliveryChallanLineItem[];
}
