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

@Entity({ name: 'inventory_locations' })
@Index(['organization', 'isDeleted'])
export class InventoryLocation extends AbstractEntity {
  @ManyToOne(() => Organization, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ length: 100 })
  name: string; // e.g., "Main Warehouse", "Store A"

  @Column({ type: 'text', nullable: true })
  address?: string | null;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // Note: OneToMany relationship defined in StockMovement entity to avoid circular import
  // Access stock movements via repository queries instead of direct property access
}
