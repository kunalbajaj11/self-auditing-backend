import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@nestjs/common';

export interface UploadResult {
  fileName: string;
  fileUrl: string;
  fileKey: string;
  fileSize: number;
  fileType: string;
}

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private s3Client: S3Client;
  private bucketName: string;
  private region: string;
  private baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.region =
      this.configService.get<string>('AWS_S3_REGION') || 'me-south-1';
    this.bucketName =
      this.configService.get<string>('AWS_S3_BUCKET') || 'smart-expense-uae';
    this.baseUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com`;

    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );

    if (accessKeyId && secretAccessKey) {
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } else {
      // Fallback for local development without AWS credentials
      console.warn(
        'AWS credentials not configured. File storage will use local mode.',
      );
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    organizationId: string,
    folder: string = 'expenses',
  ): Promise<UploadResult> {
    const fileExtension = file.originalname.split('.').pop() || 'bin';
    const fileKey = `${organizationId}/${folder}/${uuidv4()}.${fileExtension}`;

    if (!this.s3Client) {
      // Local development mode - return mock URL
      this.logger.warn(`S3 client not configured, returning local mock URL for upload. key=${fileKey}`);
      return {
        fileName: file.originalname,
        fileUrl: `/uploads/${fileKey}`,
        fileKey,
        fileSize: file.size,
        fileType: file.mimetype,
      };
    }

    try {
      this.logger.debug(`Uploading to S3 bucket=${this.bucketName} key=${fileKey} size=${file.size} type=${file.mimetype}`);
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: {
          originalName: file.originalname,
          organizationId,
        },
      });

      await this.s3Client.send(command);

      const fileUrl = `${this.baseUrl}/${fileKey}`;
      this.logger.debug(`Upload success key=${fileKey} url=${fileUrl}`);

      return {
        fileName: file.originalname,
        fileUrl,
        fileKey,
        fileSize: file.size,
        fileType: file.mimetype,
      };
    } catch (error) {
      this.logger.error(`Error uploading file to S3: ${(error as Error)?.message}`, (error as Error)?.stack);
      throw new Error('Failed to upload file to storage');
    }
  }

  async getSignedUrl(
    fileKey: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    if (!this.s3Client) {
      this.logger.warn(`S3 client not configured, returning local mock path for signed URL. key=${fileKey}`);
      return `/uploads/${fileKey}`;
    }

    try {
      this.logger.debug(`Generating signed URL for key=${fileKey} expiresIn=${expiresIn}`);
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      this.logger.debug(`Signed URL generated for key=${fileKey}`);
      return url;
    } catch (error) {
      this.logger.error(`Error generating signed URL: ${(error as Error)?.message}`, (error as Error)?.stack);
      throw new Error('Failed to generate signed URL');
    }
  }

  async getObject(
    fileKey: string,
  ): Promise<{ body: any; contentType?: string; contentLength?: number }> {
    if (!this.s3Client) {
      throw new Error('S3 not configured for direct streaming');
    }
    try {
      this.logger.debug(`Fetching object from S3 for streaming key=${fileKey}`);
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });
      const result: any = await this.s3Client.send(command);
      this.logger.debug(`Fetched object head key=${fileKey} contentType=${result?.ContentType} contentLength=${result?.ContentLength}`);
      return {
        body: result.Body,
        contentType: result.ContentType,
        contentLength: typeof result.ContentLength === 'number' ? result.ContentLength : undefined,
      };
    } catch (error) {
      this.logger.error(`Error getting object from S3: ${(error as Error)?.message}`, (error as Error)?.stack);
      throw new Error('Failed to fetch file from storage');
    }
  }

  async deleteFile(fileKey: string): Promise<void> {
    if (!this.s3Client) {
      return;
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      await this.s3Client.send(command);
    } catch (error) {
      console.error('Error deleting file from S3:', error);
      throw new Error('Failed to delete file from storage');
    }
  }

  extractFileKeyFromUrl(fileUrl: string): string | null {
    if (!fileUrl) return null;

    // Extract key from S3 URL: https://bucket.s3.region.amazonaws.com/key
    const match = fileUrl.match(/s3\.[^/]+\/(.+)$/);
    if (match) {
      return match[1];
    }

    // Extract key from path: /uploads/key
    const pathMatch = fileUrl.match(/\/uploads\/(.+)$/);
    if (pathMatch) {
      return pathMatch[1];
    }

    return null;
  }
}
