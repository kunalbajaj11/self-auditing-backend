import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { EmailService } from './email.service';
import { EmailTemplateService } from './email-template.service';
import { Notification } from '../../entities/notification.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { EmailTemplate } from '../../entities/email-template.entity';
import { EnterpriseLicenseGuard } from '../../common/guards/enterprise-license.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, Organization, User, EmailTemplate]),
  ],
  providers: [
    NotificationsService,
    EmailService,
    EmailTemplateService,
    EnterpriseLicenseGuard,
  ],
  controllers: [NotificationsController],
  exports: [NotificationsService, EmailService, EmailTemplateService],
})
export class NotificationsModule {}

