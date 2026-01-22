import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

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

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);
  private isRedisConnected = false;

  constructor(@InjectQueue('ocr') private readonly ocrQueue: Queue) {}

  async onModuleInit() {
    // Check Redis connection on startup by trying to get queue info
    // This is a lightweight operation that will fail if Redis is not connected
    try {
      // Try to get queue info - this will fail if Redis is not connected
      await this.ocrQueue.getWaitingCount();
      this.isRedisConnected = true;
      this.logger.log('✅ Redis connection established');
    } catch (error: any) {
      this.isRedisConnected = false;
      this.logger.warn(
        '⚠️  Redis connection failed. Queue operations will fail. ' +
          'Please start Redis: docker-compose up redis or install Redis locally.',
      );
      this.logger.warn(
        'For local development without Redis, the queue system requires Redis to be running.',
      );
      if (error?.message) {
        this.logger.warn(`Error details: ${error.message}`);
      }
    }

    // Set up periodic connection check (every 30 seconds)
    setInterval(async () => {
      if (!this.isRedisConnected) {
        try {
          await this.ocrQueue.getWaitingCount();
          this.isRedisConnected = true;
          this.logger.log('✅ Redis reconnected');
        } catch (error) {
          // Still disconnected, keep trying
        }
      }
    }, 30000);
  }

  async addOcrJob(data: OcrJobData) {
    if (!this.isRedisConnected) {
      throw new Error(
        'Redis is not connected. Please start Redis: docker-compose up redis',
      );
    }

    try {
      return await this.ocrQueue.add('process-ocr', data, {
        jobId: data.jobId,
        priority: 1,
      });
    } catch (error: any) {
      this.logger.error(`Failed to add OCR job to queue: ${error.message}`);
      throw error;
    }
  }

  async getJobStatus(jobId: string) {
    if (!this.isRedisConnected) {
      return null;
    }

    try {
      const job = await this.ocrQueue.getJob(jobId);
      if (!job) {
        return null;
      }

      const state = await job.getState();
      const progress = job.progress || 0;
      const result = job.returnvalue;
      const failedReason = job.failedReason;

      return {
        id: job.id,
        status: state,
        progress: typeof progress === 'number' ? progress : 0,
        result,
        error: failedReason,
        createdAt: new Date(job.timestamp),
        processedAt: job.processedOn ? new Date(job.processedOn) : null,
        finishedAt: job.finishedOn ? new Date(job.finishedOn) : null,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get job status: ${error.message}`);
      return null;
    }
  }

  async cancelJob(jobId: string) {
    if (!this.isRedisConnected) {
      return false;
    }

    try {
      const job = await this.ocrQueue.getJob(jobId);
      if (job) {
        await job.remove();
        return true;
      }
      return false;
    } catch (error: any) {
      this.logger.error(`Failed to cancel job: ${error.message}`);
      return false;
    }
  }
}
