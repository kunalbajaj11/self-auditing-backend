import {
  Controller,
  Post,
  Get,
  Param,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OcrService } from './ocr.service';
import { OcrQueueService } from './ocr-queue.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { EnterpriseLicenseGuard } from '../../common/guards/enterprise-license.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';

@Controller('ocr')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class OcrController {
  constructor(
    private readonly ocrService: OcrService,
    private readonly ocrQueueService: OcrQueueService,
  ) {}

  @Post('process')
  @UseGuards(EnterpriseLicenseGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  @UseInterceptors(FileInterceptor('file'))
  async process(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const organizationId = user?.organizationId as string;
    if (!organizationId) {
      throw new BadRequestException('Organization ID is required');
    }

    // Create job and queue it
    const job = await this.ocrQueueService.createOcrJob(
      file,
      organizationId,
      user?.userId as string | undefined,
    );

    return {
      jobId: job.jobId,
      status: job.status,
      message:
        'OCR job queued successfully. Use GET /ocr/status/:jobId to check status.',
    };
  }

  @Get('status/:jobId')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async getStatus(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const organizationId = user?.organizationId as string;
    const job = await this.ocrQueueService.getJobStatus(jobId, organizationId);

    if (!job) {
      throw new NotFoundException('OCR job not found');
    }

    return {
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
      fileName: job.fileName,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  }
}
