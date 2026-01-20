import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { Organization } from '../../entities/organization.entity';
import { Plan } from '../../entities/plan.entity';
import { LicenseKeysModule } from '../license-keys/license-keys.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SuperAdminModule } from '../super-admin/super-admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, Plan]),
    LicenseKeysModule,
    AuditLogsModule,
    forwardRef(() => SuperAdminModule),
  ],
  providers: [OrganizationsService],
  controllers: [OrganizationsController],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
