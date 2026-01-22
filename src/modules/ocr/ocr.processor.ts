import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { OcrQueueService } from './ocr-queue.service';
import { OcrJobStatus } from '../../entities/ocr-job.entity';
import { FileStorageService } from '../attachments/file-storage.service';

export interface OcrJobData {
  jobId: string;
  fileKey: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  organizationId: string;
  userId?: string;
}

@Processor('ocr')
export class OcrProcessor extends WorkerHost {
  private readonly logger = new Logger(OcrProcessor.name);

  constructor(
    private readonly ocrService: OcrService,
    private readonly ocrQueueService: OcrQueueService,
    private readonly fileStorageService: FileStorageService,
  ) {
    super();
  }

  async process(job: Job<OcrJobData>) {
    const { jobId, fileKey, fileUrl, fileName, fileType, organizationId } =
      job.data;

    this.logger.log(`Processing OCR job ${jobId} for file ${fileName}`);

    try {
      // Update status to processing
      await this.ocrQueueService.updateJobStatus(
        jobId,
        OcrJobStatus.PROCESSING,
        undefined,
        undefined,
        10,
      );

      // Download file from storage
      this.logger.debug(`Downloading file ${fileKey} from storage`);
      const fileObject = await this.fileStorageService.getObject(fileKey);
      const fileBuffer = await this.streamToBuffer(fileObject.body);

      // Create a mock file object for OCR service
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: fileName,
        encoding: '7bit',
        mimetype: fileType,
        buffer: fileBuffer,
        size: fileBuffer.length,
        destination: '',
        filename: fileName,
        path: '',
        stream: null as any,
      };

      // Update progress
      await job.updateProgress(30);

      // Process OCR
      this.logger.debug(`Running OCR processing for job ${jobId}`);
      const result = await this.ocrService.process(file, organizationId);

      // Update progress
      await job.updateProgress(90);

      // Save result
      await this.ocrQueueService.updateJobStatus(
        jobId,
        OcrJobStatus.COMPLETED,
        result,
        undefined,
        100,
      );

      this.logger.log(`OCR job ${jobId} completed successfully`);

      return result;
    } catch (error: any) {
      this.logger.error(
        `OCR job ${jobId} failed: ${error.message}`,
        error.stack,
      );

      await this.ocrQueueService.updateJobStatus(
        jobId,
        OcrJobStatus.FAILED,
        undefined,
        error.message,
      );

      throw error;
    }
  }

  private async streamToBuffer(stream: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
