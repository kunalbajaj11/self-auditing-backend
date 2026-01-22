import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OcrService } from './ocr.service';
import { OcrController } from './ocr.controller';
import { OcrQueueService } from './ocr-queue.service';
import { CategoryDetectionService } from './category-detection.service';
import { Category } from '../../entities/category.entity';
import { Organization } from '../../entities/organization.entity';
import { OcrJob } from '../../entities/ocr-job.entity';
import { EnterpriseLicenseGuard } from '../../common/guards/enterprise-license.guard';
import { QueueModule } from '../queue/queue.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { OcrProcessor } from './ocr.processor';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    TypeOrmModule.forFeature([Category, Organization, OcrJob]),
    QueueModule,
    AttachmentsModule,
    BullModule.registerQueue({
      name: 'ocr',
    }),
  ],
  providers: [
    OcrService,
    OcrQueueService,
    OcrProcessor,
    CategoryDetectionService,
    EnterpriseLicenseGuard,
  ],
  controllers: [OcrController],
  exports: [OcrService, OcrQueueService],
})
export class OcrModule {}
