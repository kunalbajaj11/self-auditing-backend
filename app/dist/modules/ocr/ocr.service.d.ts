import { ConfigService } from '@nestjs/config';
import { CategoryDetectionService } from './category-detection.service';
export interface OcrResult {
    vendorName?: string;
    vendorTrn?: string;
    invoiceNumber?: string;
    amount?: number;
    vatAmount?: number;
    expenseDate?: string;
    description?: string;
    suggestedCategoryId?: string;
    fields: Record<string, any>;
    confidence: number;
}
export declare class OcrService {
    private readonly configService;
    private readonly categoryDetectionService;
    constructor(configService: ConfigService, categoryDetectionService: CategoryDetectionService);
    process(file: Express.Multer.File, organizationId?: string): Promise<OcrResult>;
    private processMock;
    private processWithGoogleVision;
    private parseOcrText;
    private buildDescription;
    private processWithAzureFormRecognizer;
}
