import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { DeliveryChallan } from './delivery-challan.entity';
import { Product } from '../modules/products/product.entity';
import { Organization } from './organization.entity';

@Entity({ name: 'delivery_challan_line_items' })
@Index(['deliveryChallan', 'isDeleted'])
@Index(['organization', 'deliveryChallan', 'isDeleted'])
export class DeliveryChallanLineItem extends AbstractEntity {
  @ManyToOne(() => DeliveryChallan, (dc) => dc.lineItems, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'delivery_challan_id' })
  deliveryChallan: DeliveryChallan;

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

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 3, default: 1 })
  quantity: string;

  @Column({
    name: 'unit_of_measure',
    length: 20,
    nullable: true,
    default: 'unit',
  })
  unitOfMeasure?: string | null;

  @Column({ name: 'line_number', type: 'int', default: 1 })
  lineNumber: number;
}
