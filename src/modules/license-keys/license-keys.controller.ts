import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LicenseKeysService } from './license-keys.service';
import { CreateLicenseKeyDto } from './dto/create-license-key.dto';
import { RenewLicenseKeyDto } from './dto/renew-license-key.dto';
import { AllocateUploadsDto } from './dto/allocate-uploads.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@Controller('license-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
export class LicenseKeysController {
  constructor(private readonly licenseKeysService: LicenseKeysService) {}

  @Get()
  async list() {
    return this.licenseKeysService.findAll();
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLicenseKeyDto,
  ) {
    return this.licenseKeysService.create(dto, user?.userId as string);
  }

  @Patch(':id/renew')
  async renew(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RenewLicenseKeyDto,
  ) {
    return this.licenseKeysService.renew(id, dto);
  }

  @Patch(':id/revoke')
  async revoke(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.licenseKeysService.revoke(id);
  }

  @Patch(':id/allocate-uploads')
  async allocateUploads(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AllocateUploadsDto,
  ) {
    return this.licenseKeysService.allocateUploads(id, dto.additionalUploads);
  }

  @Get('organization/:organizationId/upload-usage')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(TenantGuard)
  async getUploadUsage(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Superadmin can access any organization, others can only access their own
    if (
      user.role !== UserRole.SUPERADMIN &&
      user.organizationId !== organizationId
    ) {
      throw new ForbiddenException(
        "You can only access your own organization's upload usage",
      );
    }
    return this.licenseKeysService.getUploadUsage(organizationId);
  }

  @Get('organization/:organizationId')
  async getByOrganizationId(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ) {
    const license =
      await this.licenseKeysService.findByOrganizationId(organizationId);
    if (!license) {
      return null;
    }
    return license;
  }
}
