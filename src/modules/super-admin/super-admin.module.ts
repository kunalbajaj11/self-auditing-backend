import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { Organization } from '../../entities/organization.entity';
import { Expense } from '../../entities/expense.entity';
import { User } from '../../entities/user.entity';
import { Attachment } from '../../entities/attachment.entity';
import { Accrual } from '../../entities/accrual.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { LicenseKeysModule } from '../license-keys/license-keys.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      Expense,
      User,
      Attachment,
      Accrual,
      AuditLog,
    ]),
    LicenseKeysModule,
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
})
export class SuperAdminModule {}
