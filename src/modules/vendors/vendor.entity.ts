import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Index,
  Unique,
} from 'typeorm';
import { AbstractEntity } from '../../entities/abstract.entity';
import { Organization } from '../../entities/organization.entity';
import { Expense } from '../../entities/expense.entity';
import { PurchaseOrder } from '../../entities/purchase-order.entity';

@Entity({ name: 'vendors' })
@Unique(['organization', 'name'])
@Index(['organization', 'name'])
export class Vendor extends AbstractEntity {
  @ManyToOne(() => Organization, (organization) => organization.vendors, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ length: 200 })
  name: string;

  @Column({ name: 'display_name', length: 200, nullable: true })
  displayName?: string | null;

  @Column({ name: 'vendor_trn', length: 50, nullable: true })
  vendorTrn?: string | null;

  @Column({ name: 'vendor_category', length: 100, nullable: true })
  category?: string | null;

  @Column({ type: 'text', nullable: true })
  address?: string | null;

  @Column({ length: 100, nullable: true })
  city?: string | null;

  @Column({ length: 50, nullable: true })
  country?: string | null;

  @Column({ length: 20, nullable: true })
  phone?: string | null;

  @Column({ length: 100, nullable: true })
  email?: string | null;

  @Column({ length: 10, nullable: true })
  website?: string | null;

  @Column({ name: 'contact_person', length: 100, nullable: true })
  contactPerson?: string | null;

  @Column({ name: 'preferred_currency', length: 10, default: 'AED' })
  preferredCurrency: string;

  @Column({ name: 'payment_terms', type: 'int', nullable: true })
  paymentTerms?: number | null; // Days

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @OneToMany(() => Expense, (expense) => expense.vendor)
  expenses: Expense[];

  @OneToMany(() => PurchaseOrder, (po) => po.vendor)
  purchaseOrders: PurchaseOrder[];

  @Column({ name: 'first_used_at', type: 'timestamp', nullable: true })
  firstUsedAt?: Date | null;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt?: Date | null;
}
