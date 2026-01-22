import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OcrJob, OcrJobStatus } from '../../entities/ocr-job.entity';
import { QueueService } from '../queue/queue.service';
import { FileStorageService } from '../attachments/file-storage.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class OcrQueueService {
  constructor(
    @InjectRepository(OcrJob)
    private readonly ocrJobRepository: Repository<OcrJob>,
    private readonly queueService: QueueService,
    private readonly fileStorageService: FileStorageService,
  ) {}

  async createOcrJob(
    file: Express.Multer.File,
    organizationId: string,
    userId?: string,
  ): Promise<OcrJob> {
    // Upload file to storage first
    const uploadResult = await this.fileStorageService.uploadFile(
      file,
      organizationId,
      'ocr-temp',
    );

    // Create job record
    const jobId = uuidv4();
    const ocrJob = this.ocrJobRepository.create({
      jobId,
      organizationId,
      userId,
      fileName: file.originalname,
      fileKey: uploadResult.fileKey,
      fileUrl: uploadResult.fileUrl,
      fileType: file.mimetype,
      fileSize: file.size,
      status: OcrJobStatus.PENDING,
      progress: 0,
    });

    await this.ocrJobRepository.save(ocrJob);

    // Add to queue (with error handling)
    try {
      await this.queueService.addOcrJob({
        jobId,
        fileKey: uploadResult.fileKey,
        fileUrl: uploadResult.fileUrl,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
        organizationId,
        userId,
      });
    } catch (error: any) {
      // If queue fails, update job status to failed
      await this.updateJobStatus(
        jobId,
        OcrJobStatus.FAILED,
        undefined,
        `Failed to queue job: ${error.message}`,
      );
      throw error;
    }

    return ocrJob;
  }

  async getJobStatus(
    jobId: string,
    organizationId: string,
  ): Promise<OcrJob | null> {
    return this.ocrJobRepository.findOne({
      where: { jobId, organizationId },
    });
  }

  async updateJobStatus(
    jobId: string,
    status: OcrJobStatus,
    result?: any,
    error?: string,
    progress?: number,
  ): Promise<void> {
    const updateData: any = {
      status,
    };

    if (result !== undefined) {
      updateData.result = result;
    }
    if (error !== undefined) {
      updateData.error = error;
    }
    if (progress !== undefined) {
      updateData.progress = progress;
    }

    if (status === OcrJobStatus.PROCESSING && !updateData.startedAt) {
      updateData.startedAt = new Date();
    }

    if (status === OcrJobStatus.COMPLETED || status === OcrJobStatus.FAILED) {
      updateData.completedAt = new Date();
    }

    await this.ocrJobRepository.update({ jobId }, updateData);
  }
}
