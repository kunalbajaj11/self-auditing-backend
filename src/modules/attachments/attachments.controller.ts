import {
  Controller,
  Post,
  Get,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
  Res,
  NotFoundException,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
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
import { FileStorageService } from './file-storage.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attachment } from '../../entities/attachment.entity';

@Controller('attachments')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class AttachmentsController {
  private readonly logger = new Logger(AttachmentsController.name);

  constructor(
    private readonly fileStorageService: FileStorageService,
    @InjectRepository(Attachment)
    private readonly attachmentsRepository: Repository<Attachment>,
  ) {}

  @Post('upload')
  @UseGuards(EnterpriseLicenseGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
    @Query('folder') folder?: string,
  ) {
    if (!file) {
      throw new Error('No file provided');
    }

    const result = await this.fileStorageService.uploadFile(
      file,
      user?.organizationId as string,
      folder || 'expenses',
    );

    return {
      ...result,
      uploadedBy: user?.userId,
      uploadedAt: new Date(),
    };
  }

  @Get('view/:attachmentId')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async viewFile(
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res?: Response,
  ) {
    this.logger.debug(`viewFile called: attachmentId=${attachmentId}, userId=${user?.userId}, orgId=${user?.organizationId}, role=${user?.role}`);
    // Find attachment and verify access
    const attachment = await this.attachmentsRepository.findOne({
      where: { id: attachmentId, isDeleted: false },
      relations: ['organization', 'expense', 'expense.user'],
    });

    if (!attachment) {
      this.logger.warn(`Attachment not found: ${attachmentId}`);
      throw new NotFoundException('File not found');
    }

    // Verify organization access
    if (attachment.organization.id !== user?.organizationId) {
      this.logger.warn(`Forbidden: org mismatch. attachment.org=${attachment.organization.id} user.org=${user?.organizationId}`);
      throw new ForbiddenException('Access denied to this file');
    }

    // Verify user has access to the expense (employees can only see their own)
    if (user?.role === UserRole.EMPLOYEE) {
      if (attachment.expense.user.id !== user?.userId) {
        this.logger.warn(`Forbidden: employee tried to access another user's attachment. expense.user=${attachment.expense.user.id} user=${user?.userId}`);
        throw new ForbiddenException('Access denied to this file');
      }
    }

    if (!attachment.fileKey) {
      this.logger.warn(`Attachment missing fileKey: ${attachmentId}`);
      throw new NotFoundException('File key not found');
    }

    // If this looks like an XHR/JSON request, return JSON with signed URL (no streaming/redirects)
    const acceptsJson =
      req?.headers?.accept?.includes('application/json') ||
      req?.headers?.['x-requested-with'] === 'XMLHttpRequest';
    const wantsJson = acceptsJson || req?.query?.['json'] === '1';
    if (wantsJson) {
      this.logger.debug(`XHR detected, returning JSON signed URL for view key=${attachment.fileKey}`);
      const signedUrl = await this.fileStorageService.getSignedUrl(attachment.fileKey, 300);
      res?.setHeader?.('Content-Type', 'application/json');
      return { url: signedUrl };
    }

    // Otherwise, stream for direct browser navigation
    if (res) {
      try {
        this.logger.debug(`Attempting to stream object inline: key=${attachment.fileKey}`);
        const obj = await this.fileStorageService.getObject(attachment.fileKey);
        if (obj.contentType) {
          res.setHeader('Content-Type', obj.contentType);
        }
        res.setHeader('Cache-Control', 'private, max-age=300'); // 5 minutes
        if (obj.body?.pipe) {
          this.logger.debug(`Streaming started for key=${attachment.fileKey}`);
          obj.body.pipe(res);
          return;
        }
      } catch (e) {
        // Fallback to signed URL redirect if streaming fails
        this.logger.error(`Streaming failed for key=${attachment.fileKey}. Falling back to signed URL. Error=${(e as Error)?.message}`);
        const signedUrl = await this.fileStorageService.getSignedUrl(attachment.fileKey, 300);
        res.redirect(signedUrl);
        return;
      }
    }

    // Fallback API usage: return signed URL
    this.logger.debug(`Returning signed URL for API usage: key=${attachment.fileKey}`);
    const signedUrl = await this.fileStorageService.getSignedUrl(attachment.fileKey, 300);
    return { url: signedUrl };
  }

  @Get('download/:attachmentId')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async downloadFile(
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res?: Response,
  ) {
    this.logger.debug(`downloadFile called: attachmentId=${attachmentId}, userId=${user?.userId}, orgId=${user?.organizationId}, role=${user?.role}`);
    // Find attachment and verify access
    const attachment = await this.attachmentsRepository.findOne({
      where: { id: attachmentId, isDeleted: false },
      relations: ['organization', 'expense', 'expense.user'],
    });

    if (!attachment) {
      this.logger.warn(`Attachment not found: ${attachmentId}`);
      throw new NotFoundException('File not found');
    }

    // Verify organization access
    if (attachment.organization.id !== user?.organizationId) {
      this.logger.warn(`Forbidden: org mismatch. attachment.org=${attachment.organization.id} user.org=${user?.organizationId}`);
      throw new ForbiddenException('Access denied to this file');
    }

    // Verify user has access to the expense (employees can only see their own)
    if (user?.role === UserRole.EMPLOYEE) {
      if (attachment.expense.user.id !== user?.userId) {
        this.logger.warn(`Forbidden: employee tried to download another user's attachment. expense.user=${attachment.expense.user.id} user=${user?.userId}`);
        throw new ForbiddenException('Access denied to this file');
      }
    }

    if (!attachment.fileKey) {
      this.logger.warn(`Attachment missing fileKey: ${attachmentId}`);
      throw new NotFoundException('File key not found');
    }

    // If this looks like an XHR/JSON request, return JSON with signed URL (no streaming/redirects)
    const acceptsJson =
      req?.headers?.accept?.includes('application/json') ||
      req?.headers?.['x-requested-with'] === 'XMLHttpRequest';
    const wantsJson = acceptsJson || req?.query?.['json'] === '1';
    if (wantsJson) {
      this.logger.debug(`XHR detected, returning JSON signed URL for download key=${attachment.fileKey}`);
      const signedUrl = await this.fileStorageService.getSignedUrl(attachment.fileKey, 300);
      res?.setHeader?.('Content-Type', 'application/json');
      return { url: signedUrl, fileName: attachment.fileName, fileType: attachment.fileType };
    }

    // Otherwise, stream for direct browser navigation
    if (res) {
      try {
        this.logger.debug(`Attempting to stream object as attachment: key=${attachment.fileKey}`);
        const obj = await this.fileStorageService.getObject(attachment.fileKey);
        res.setHeader('Content-Disposition', `attachment; filename="${attachment.fileName}"`);
        res.setHeader('Cache-Control', 'private, max-age=300'); // 5 minutes
        res.setHeader('Content-Type', attachment.fileType || obj.contentType || 'application/octet-stream');
        if (obj.contentLength) {
          res.setHeader('Content-Length', obj.contentLength.toString());
        }
        if (obj.body?.pipe) {
          this.logger.debug(`Streaming download started for key=${attachment.fileKey}`);
          obj.body.pipe(res);
          return;
        }
      } catch (e) {
        // Fallback to signed URL redirect if streaming fails
        this.logger.error(`Streaming download failed for key=${attachment.fileKey}. Falling back to signed URL. Error=${(e as Error)?.message}`);
        const signedUrl = await this.fileStorageService.getSignedUrl(attachment.fileKey, 300);
        res.setHeader('Content-Disposition', `attachment; filename="${attachment.fileName}"`);
        res.redirect(signedUrl);
        return;
      }
    }

    // API usage: return signed URL + suggested filename/type
    this.logger.debug(`Returning signed URL for API usage (download): key=${attachment.fileKey}`);
    const signedUrl = await this.fileStorageService.getSignedUrl(attachment.fileKey, 300);
    return { url: signedUrl, fileName: attachment.fileName, fileType: attachment.fileType };
  }

  @Get('signed-url')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async getSignedUrl(
    @Query('fileKey') fileKey: string,
    @Query('expiresIn') expiresIn?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (!fileKey) {
      throw new Error('File key is required');
    }

    // Verify that the file belongs to the user's organization
    const attachment = await this.attachmentsRepository.findOne({
      where: { fileKey, isDeleted: false },
      relations: ['organization'],
    });

    if (!attachment) {
      throw new NotFoundException('File not found');
    }

    if (attachment.organization.id !== user?.organizationId) {
      throw new ForbiddenException('Access denied to this file');
    }

    const url = await this.fileStorageService.getSignedUrl(
      fileKey,
      expiresIn ? parseInt(expiresIn, 10) : 3600,
    );

    return { url };
  }

  @Delete(':fileKey')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async delete(@Param('fileKey') fileKey: string) {
    await this.fileStorageService.deleteFile(fileKey);
    return { success: true };
  }
}

