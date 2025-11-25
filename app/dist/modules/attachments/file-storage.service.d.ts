import { ConfigService } from '@nestjs/config';
export interface UploadResult {
    fileName: string;
    fileUrl: string;
    fileKey: string;
    fileSize: number;
    fileType: string;
}
export declare class FileStorageService {
    private readonly configService;
    private readonly logger;
    private s3Client;
    private bucketName;
    private region;
    private baseUrl;
    constructor(configService: ConfigService);
    uploadFile(file: Express.Multer.File, organizationId: string, folder?: string): Promise<UploadResult>;
    getSignedUrl(fileKey: string, expiresIn?: number): Promise<string>;
    getObject(fileKey: string): Promise<{
        body: any;
        contentType?: string;
        contentLength?: number;
    }>;
    deleteFile(fileKey: string): Promise<void>;
    extractFileKeyFromUrl(fileUrl: string): string | null;
}
