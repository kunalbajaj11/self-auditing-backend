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

/** When true, do not register the BullMQ worker (avoids Redis at boot for local `npm start`). */
const disableOcrWorker =
  process.env.DISABLE_OCR_QUEUE_WORKER === 'true' ||
  process.env.DISABLE_OCR_QUEUE_WORKER === '1';

@Module({
  imports: [
    TypeOrmModule.forFeature([Category, Organization, OcrJob]),
    QueueModule,
    AttachmentsModule,
  ],
  providers: [
    OcrService,
    OcrQueueService,
    ...(disableOcrWorker ? [] : [OcrProcessor]),
    CategoryDetectionService,
    EnterpriseLicenseGuard,
  ],
  controllers: [OcrController],
  exports: [OcrService, OcrQueueService],
})
export class OcrModule {}
