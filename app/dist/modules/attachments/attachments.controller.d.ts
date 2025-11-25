import { Request, Response } from 'express';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { FileStorageService } from './file-storage.service';
import { Repository } from 'typeorm';
import { Attachment } from '../../entities/attachment.entity';
export declare class AttachmentsController {
    private readonly fileStorageService;
    private readonly attachmentsRepository;
    private readonly logger;
    constructor(fileStorageService: FileStorageService, attachmentsRepository: Repository<Attachment>);
    upload(file: Express.Multer.File, user: AuthenticatedUser, folder?: string): Promise<{
        uploadedBy: string;
        uploadedAt: Date;
        fileName: string;
        fileUrl: string;
        fileKey: string;
        fileSize: number;
        fileType: string;
    }>;
    viewFile(attachmentId: string, user: AuthenticatedUser, req: Request, res?: Response): Promise<{
        url: string;
    }>;
    downloadFile(attachmentId: string, user: AuthenticatedUser, req: Request, res?: Response): Promise<{
        url: string;
        fileName: string;
        fileType: string;
    }>;
    getSignedUrl(fileKey: string, expiresIn?: string, user?: AuthenticatedUser): Promise<{
        url: string;
    }>;
    delete(fileKey: string): Promise<{
        success: boolean;
    }>;
}
