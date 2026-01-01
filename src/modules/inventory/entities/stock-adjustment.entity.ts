import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Index,
} from 'typeorm';
import { AbstractEntity } from '../../../entities/abstract.entity';
import { Organization } from '../../../entities/organization.entity';
import { InventoryLocation } from './inventory-location.entity';
import { User } from '../../../entities/user.entity';
import { StockAdjustmentStatus } from '../../../common/enums/stock-adjustment-status.enum';
import { StockAdjustmentReason } from '../../../common/enums/stock-adjustment-reason.enum';
import { StockAdjustmentItem } from './stock-adjustment-item.entity';

@Entity({ name: 'stock_adjustments' })
@Index(['organization', 'status', 'isDeleted'])
export class StockAdjustment extends AbstractEntity {
  @ManyToOne(() => Organization, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => InventoryLocation, {
    nullable: false,
  })
  @JoinColumn({ name: 'location_id' })
  location: InventoryLocation;

  @Column({ name: 'adjustment_date', type: 'date' })
  adjustmentDate: string;

  @Column({
    type: 'enum',
    enum: StockAdjustmentReason,
  })
  reason: StockAdjustmentReason;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({
    type: 'enum',
    enum: StockAdjustmentStatus,
    default: StockAdjustmentStatus.DRAFT,
  })
  status: StockAdjustmentStatus;

  @ManyToOne(() => User, {
    nullable: false,
  })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @ManyToOne(() => User, {
    nullable: true,
  })
  @JoinColumn({ name: 'approved_by_id' })
  approvedBy?: User | null;

  @OneToMany(() => StockAdjustmentItem, (item) => item.adjustment, {
    cascade: true,
  })
  adjustmentItems: StockAdjustmentItem[];
}
