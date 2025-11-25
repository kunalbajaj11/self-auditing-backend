import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';

@Entity({ name: 'exchange_rates' })
@Index(['organization', 'fromCurrency', 'toCurrency', 'date'], { unique: true })
export class ExchangeRate extends AbstractEntity {
  @ManyToOne(() => Organization, (organization) => organization.exchangeRates, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'from_currency', length: 10 })
  fromCurrency: string; // e.g., 'USD'

  @Column({ name: 'to_currency', length: 10 })
  toCurrency: string; // e.g., 'AED'

  @Column({ type: 'decimal', precision: 12, scale: 6 })
  rate: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ length: 50, default: 'manual' })
  source: string; // 'fixer.io' | 'exchange-rate-api' | 'manual'

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_manual', default: false })
  isManual: boolean; // If true, was manually set and shouldn't be overwritten
}

