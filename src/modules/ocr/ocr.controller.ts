import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OcrService } from './ocr.service';
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
  constructor(private readonly ocrService: OcrService) {}

  @Post('process')
  @UseGuards(EnterpriseLicenseGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  @UseInterceptors(FileInterceptor('file'))
  async process(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ocrService.process(
      file,
      user?.organizationId as string | undefined,
    );
  }
}
