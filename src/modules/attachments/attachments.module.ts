import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileStorageService } from './file-storage.service';
import { AttachmentsController } from './attachments.controller';
import { Attachment } from '../../entities/attachment.entity';
import { Organization } from '../../entities/organization.entity';
import { EnterpriseLicenseGuard } from '../../common/guards/enterprise-license.guard';
import { ImageOptimizationService } from './image-optimization.service';

@Module({
  imports: [TypeOrmModule.forFeature([Attachment, Organization])],
  providers: [ImageOptimizationService, FileStorageService, EnterpriseLicenseGuard],
  controllers: [AttachmentsController],
  exports: [FileStorageService, ImageOptimizationService],
})
export class AttachmentsModule {}

