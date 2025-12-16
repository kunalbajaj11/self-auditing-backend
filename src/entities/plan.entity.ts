import { Column, Entity, OneToMany } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';

@Entity({ name: 'plans' })
export class Plan extends AbstractEntity {
  @Column({ length: 50 })
  name: string;

  @Column('text')
  description: string;

  @Column({ name: 'max_users', type: 'int', nullable: true })
  maxUsers?: number | null;

  @Column({ name: 'max_storage_mb', type: 'int', nullable: true })
  maxStorageMb?: number | null;

  @Column({ name: 'max_expenses_per_month', type: 'int', nullable: true })
  maxExpensesPerMonth?: number | null;

  @Column({
    name: 'price_monthly',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  priceMonthly?: string | null;

  @Column({
    name: 'price_yearly',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  priceYearly?: string | null;

  @OneToMany(() => Organization, (organization) => organization.plan)
  organizations: Organization[];
}
