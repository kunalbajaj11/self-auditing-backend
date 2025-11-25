import { OcrService } from './ocr.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
export declare class OcrController {
    private readonly ocrService;
    constructor(ocrService: OcrService);
    process(file: Express.Multer.File, user: AuthenticatedUser): Promise<import("./ocr.service").OcrResult>;
}
