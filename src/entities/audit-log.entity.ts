import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { AuditAction } from '../common/enums/audit-action.enum';

@Entity({ name: 'audit_logs' })
@Index('idx_audit_logs_org', ['organization'])
export class AuditLog extends AbstractEntity {
  @ManyToOne(() => Organization, (organization) => organization.auditLogs, {
    nullable: false,
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User, (user) => user.auditLogs, {
    nullable: true,
  })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ name: 'entity_type', length: 100 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  @Column({ type: 'jsonb', nullable: true })
  changes?: Record<string, any> | null;

  @Column({ name: 'ip_address', length: 50, nullable: true })
  ipAddress?: string | null;

  @Column({ type: 'timestamp' })
  timestamp: Date;
}
