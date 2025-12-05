import { Injectable, Optional, Inject } from '@nestjs/common';
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
import { ImageOptimizationService } from './image-optimization.service';

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
  private storageType: 's3' | 'r2';

  constructor(
    private readonly configService: ConfigService,
    @Optional() @Inject(ImageOptimizationService)
    private readonly imageOptimizationService?: ImageOptimizationService,
  ) {
    // Support both AWS S3 and Cloudflare R2
    // Default to 'r2' if R2 credentials are present, otherwise 's3'
    const hasR2Credentials =
      this.configService.get<string>('R2_ACCESS_KEY_ID') &&
      this.configService.get<string>('R2_SECRET_ACCESS_KEY') &&
      this.configService.get<string>('R2_ACCOUNT_ID');
    this.storageType =
      (this.configService.get<string>('STORAGE_TYPE') ||
        (hasR2Credentials ? 'r2' : 's3')) as 's3' | 'r2';
    this.bucketName =
      this.configService.get<string>('AWS_S3_BUCKET') ||
      this.configService.get<string>('R2_BUCKET_NAME') ||
      'smart-expense-uae';

    const accessKeyId =
      this.configService.get<string>('AWS_ACCESS_KEY_ID') ||
      this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey =
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY') ||
      this.configService.get<string>('R2_SECRET_ACCESS_KEY');

    if (this.storageType === 'r2') {
      // Cloudflare R2 configuration
      const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
      const r2Endpoint =
        this.configService.get<string>('R2_ENDPOINT') ||
        `https://${accountId}.r2.cloudflarestorage.com`;
      const publicUrl =
        this.configService.get<string>('R2_PUBLIC_BASE_URL') ||
        this.configService.get<string>('R2_PUBLIC_URL') ||
        (accountId
          ? `https://${this.bucketName}.${accountId}.r2.cloudflarestorage.com`
          : `https://${this.bucketName}.r2.cloudflarestorage.com`);

      this.baseUrl = publicUrl;
      this.region = 'auto'; // R2 uses 'auto' as region

      if (accessKeyId && secretAccessKey && accountId) {
        // Cloudflare R2 is S3-compatible, so we use AWS SDK
        // R2 requires TLS 1.2+ and proper SNI (Server Name Indication)
        // Using the simplest configuration - let AWS SDK handle SSL negotiation
        
        this.s3Client = new S3Client({
          region: this.region,
          endpoint: r2Endpoint,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
          forcePathStyle: true, // R2 requires path-style addressing (bucket/key format)
          // Don't override requestHandler - let AWS SDK use its default SSL/TLS handling
          // This should work better with Cloudflare R2's SSL requirements
        });
        this.logger.log(
          `R2 storage configured: bucket=${this.bucketName} endpoint=${r2Endpoint} region=${this.region}`,
        );
      } else {
        this.logger.warn(
          'R2 credentials not configured. File storage will use local mode.',
        );
      }
    } else {
      // AWS S3 configuration (default)
      this.region =
        this.configService.get<string>('AWS_S3_REGION') || 'me-south-1';
      this.baseUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com`;

      if (accessKeyId && secretAccessKey) {
        this.s3Client = new S3Client({
          region: this.region,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        });
      } else {
        console.warn(
          'AWS credentials not configured. File storage will use local mode.',
        );
      }
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    organizationId: string,
    folder: string = 'expenses',
  ): Promise<UploadResult> {
    const fileExtension = file.originalname.split('.').pop() || 'bin';
    const fileKey = `${organizationId}/${folder}/${uuidv4()}.${fileExtension}`;

    // Optimize image before upload if it's an image file
    let uploadBuffer = file.buffer;
    const uploadMimeType = file.mimetype;
    let uploadSize = file.size;

    if (this.imageOptimizationService && this.imageOptimizationService.isImageFile(file.mimetype)) {
      try {
        this.logger.debug(`Optimizing image before upload: ${file.originalname} (${file.size} bytes)`);
        const optimizationResult = await this.imageOptimizationService.optimizeImage(
          file.buffer,
          file.mimetype,
        );

        if (optimizationResult.optimized) {
          uploadBuffer = optimizationResult.buffer;
          uploadSize = optimizationResult.optimizedSize;
          this.logger.log(
            `Image optimized before upload: ${optimizationResult.originalSize} bytes -> ${optimizationResult.optimizedSize} bytes (${((optimizationResult.originalSize - optimizationResult.optimizedSize) / optimizationResult.originalSize * 100).toFixed(1)}% reduction)`,
          );
        }
      } catch (error) {
        // If optimization fails, log warning but continue with original file
        this.logger.warn(
          `Image optimization failed, uploading original: ${(error as Error)?.message}`,
        );
      }
    }

    if (!this.s3Client) {
      // Local development mode - return mock URL
      this.logger.warn(`S3 client not configured, returning local mock URL for upload. key=${fileKey}`);
      return {
        fileName: file.originalname,
        fileUrl: `/uploads/${fileKey}`,
        fileKey,
        fileSize: uploadSize,
        fileType: uploadMimeType,
      };
    }

    try {
      const storageName = this.storageType === 'r2' ? 'R2' : 'S3';
      this.logger.debug(`Uploading to ${storageName} bucket=${this.bucketName} key=${fileKey} size=${uploadSize} type=${uploadMimeType}`);
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
        Body: uploadBuffer,
        ContentType: uploadMimeType,
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
        fileSize: uploadSize,
        fileType: uploadMimeType,
      };
    } catch (error) {
      const storageName = this.storageType === 'r2' ? 'R2' : 'S3';
      const errorMessage = (error as Error)?.message || 'Unknown error';
      const errorStack = (error as Error)?.stack;
      
      // Log detailed error information for debugging SSL issues
      this.logger.error(
        `Error uploading file to ${storageName}: ${errorMessage}`,
        errorStack,
      );
      
      // If it's an SSL/TLS error, log additional context
      if (errorMessage.includes('SSL') || errorMessage.includes('TLS') || errorMessage.includes('handshake')) {
        const endpoint = this.storageType === 'r2' 
          ? (this.configService.get<string>('R2_ENDPOINT') || `https://${this.configService.get<string>('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`)
          : 'S3';
        this.logger.error(
          `SSL/TLS error detected. This may indicate: ` +
          `1) Container Node.js/OpenSSL version incompatibility, ` +
          `2) Network/proxy interference, or ` +
          `3) Cloudflare R2 SSL requirements changed. ` +
          `Endpoint: ${endpoint}, Region: ${this.region}, Bucket: ${this.bucketName}. ` +
          `Please check container Node.js version (node --version) and OpenSSL version (openssl version).`,
        );
      }
      
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
    const s3Match = fileUrl.match(/s3\.[^/]+\/(.+)$/);
    if (s3Match) {
      return s3Match[1];
    }

    // Extract key from R2 URL: https://bucket.account-id.r2.cloudflarestorage.com/key
    // or custom domain: https://custom-domain.com/key
    const r2Match = fileUrl.match(/r2\.cloudflarestorage\.com\/(.+)$/);
    if (r2Match) {
      return r2Match[1];
    }

    // Extract key from custom R2 domain or any URL ending with the key
    const customDomainMatch = fileUrl.match(/\/\/([^/]+)\/(.+)$/);
    if (customDomainMatch) {
      // Check if it's likely an R2 custom domain (you may need to adjust this)
      return customDomainMatch[2];
    }

    // Extract key from path: /uploads/key
    const pathMatch = fileUrl.match(/\/uploads\/(.+)$/);
    if (pathMatch) {
      return pathMatch[1];
    }

    return null;
  }
}
