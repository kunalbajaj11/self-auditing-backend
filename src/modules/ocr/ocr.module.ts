import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OcrService } from './ocr.service';
import { OcrController } from './ocr.controller';
import { CategoryDetectionService } from './category-detection.service';
import { Category } from '../../entities/category.entity';
import { Organization } from '../../entities/organization.entity';
import { EnterpriseLicenseGuard } from '../../common/guards/enterprise-license.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Organization])],
  providers: [OcrService, CategoryDetectionService, EnterpriseLicenseGuard],
  controllers: [OcrController],
  exports: [OcrService],
})
export class OcrModule {}

