import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';

@Entity({ name: 'ledger_accounts' })
@Unique(['organization', 'name'])
export class LedgerAccount extends AbstractEntity {
  @ManyToOne(
    () => Organization,
    (organization) => organization.ledgerAccounts,
    {
      nullable: false,
    },
  )
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({
    type: 'varchar',
    length: 20,
  })
  category: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

  @Column({ name: 'is_system_default', default: false })
  isSystemDefault: boolean;

  @ManyToOne(() => User, (user) => user.createdLedgerAccounts, {
    nullable: true,
  })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User | null;
}
