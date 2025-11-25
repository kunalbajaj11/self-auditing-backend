"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var FileStorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileStorageService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const uuid_1 = require("uuid");
const common_2 = require("@nestjs/common");
let FileStorageService = FileStorageService_1 = class FileStorageService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_2.Logger(FileStorageService_1.name);
        this.region =
            this.configService.get('AWS_S3_REGION') || 'me-south-1';
        this.bucketName =
            this.configService.get('AWS_S3_BUCKET') || 'smart-expense-uae';
        this.baseUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com`;
        const accessKeyId = this.configService.get('AWS_ACCESS_KEY_ID');
        const secretAccessKey = this.configService.get('AWS_SECRET_ACCESS_KEY');
        if (accessKeyId && secretAccessKey) {
            this.s3Client = new client_s3_1.S3Client({
                region: this.region,
                credentials: {
                    accessKeyId,
                    secretAccessKey,
                },
            });
        }
        else {
            console.warn('AWS credentials not configured. File storage will use local mode.');
        }
    }
    async uploadFile(file, organizationId, folder = 'expenses') {
        const fileExtension = file.originalname.split('.').pop() || 'bin';
        const fileKey = `${organizationId}/${folder}/${(0, uuid_1.v4)()}.${fileExtension}`;
        if (!this.s3Client) {
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
            const command = new client_s3_1.PutObjectCommand({
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
        }
        catch (error) {
            this.logger.error(`Error uploading file to S3: ${error?.message}`, error?.stack);
            throw new Error('Failed to upload file to storage');
        }
    }
    async getSignedUrl(fileKey, expiresIn = 3600) {
        if (!this.s3Client) {
            this.logger.warn(`S3 client not configured, returning local mock path for signed URL. key=${fileKey}`);
            return `/uploads/${fileKey}`;
        }
        try {
            this.logger.debug(`Generating signed URL for key=${fileKey} expiresIn=${expiresIn}`);
            const command = new client_s3_1.GetObjectCommand({
                Bucket: this.bucketName,
                Key: fileKey,
            });
            const url = await (0, s3_request_presigner_1.getSignedUrl)(this.s3Client, command, { expiresIn });
            this.logger.debug(`Signed URL generated for key=${fileKey}`);
            return url;
        }
        catch (error) {
            this.logger.error(`Error generating signed URL: ${error?.message}`, error?.stack);
            throw new Error('Failed to generate signed URL');
        }
    }
    async getObject(fileKey) {
        if (!this.s3Client) {
            throw new Error('S3 not configured for direct streaming');
        }
        try {
            this.logger.debug(`Fetching object from S3 for streaming key=${fileKey}`);
            const command = new client_s3_1.GetObjectCommand({
                Bucket: this.bucketName,
                Key: fileKey,
            });
            const result = await this.s3Client.send(command);
            this.logger.debug(`Fetched object head key=${fileKey} contentType=${result?.ContentType} contentLength=${result?.ContentLength}`);
            return {
                body: result.Body,
                contentType: result.ContentType,
                contentLength: typeof result.ContentLength === 'number' ? result.ContentLength : undefined,
            };
        }
        catch (error) {
            this.logger.error(`Error getting object from S3: ${error?.message}`, error?.stack);
            throw new Error('Failed to fetch file from storage');
        }
    }
    async deleteFile(fileKey) {
        if (!this.s3Client) {
            return;
        }
        try {
            const command = new client_s3_1.DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: fileKey,
            });
            await this.s3Client.send(command);
        }
        catch (error) {
            console.error('Error deleting file from S3:', error);
            throw new Error('Failed to delete file from storage');
        }
    }
    extractFileKeyFromUrl(fileUrl) {
        if (!fileUrl)
            return null;
        const match = fileUrl.match(/s3\.[^/]+\/(.+)$/);
        if (match) {
            return match[1];
        }
        const pathMatch = fileUrl.match(/\/uploads\/(.+)$/);
        if (pathMatch) {
            return pathMatch[1];
        }
        return null;
    }
};
exports.FileStorageService = FileStorageService;
exports.FileStorageService = FileStorageService = FileStorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], FileStorageService);
//# sourceMappingURL=file-storage.service.js.map