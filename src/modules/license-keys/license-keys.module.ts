import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LicenseKeysService } from './license-keys.service';
import { LicenseKeysController } from './license-keys.controller';
import { LicenseKey } from '../../entities/license-key.entity';
import { Attachment } from '../../entities/attachment.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LicenseKey, Attachment]),
    NotificationsModule,
  ],
  providers: [LicenseKeysService],
  controllers: [LicenseKeysController],
  exports: [LicenseKeysService],
})
export class LicenseKeysModule {}
