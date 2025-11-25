import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileStorageService } from './file-storage.service';
import { AttachmentsController } from './attachments.controller';
import { Attachment } from '../../entities/attachment.entity';
import { Organization } from '../../entities/organization.entity';
import { EnterpriseLicenseGuard } from '../../common/guards/enterprise-license.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Attachment, Organization])],
  providers: [FileStorageService, EnterpriseLicenseGuard],
  controllers: [AttachmentsController],
  exports: [FileStorageService],
})
export class AttachmentsModule {}

