import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { EmailService } from './email.service';
import { Notification } from '../../entities/notification.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { EnterpriseLicenseGuard } from '../../common/guards/enterprise-license.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, Organization, User])],
  providers: [NotificationsService, EmailService, EnterpriseLicenseGuard],
  controllers: [NotificationsController],
  exports: [NotificationsService, EmailService],
})
export class NotificationsModule {}

