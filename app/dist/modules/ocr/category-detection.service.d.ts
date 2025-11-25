import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Category } from '../../entities/category.entity';
export declare class CategoryDetectionService {
    private readonly categoriesRepository;
    private readonly configService;
    private readonly categoryKeywords;
    constructor(categoriesRepository: Repository<Category>, configService: ConfigService);
    detectCategory(ocrText: string, organizationId: string): Promise<Category | null>;
    detectCategoryWithAI(ocrText: string, vendorName: string | undefined, organizationId: string): Promise<Category | null>;
}
