import {
  Body,
  Controller,
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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
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
}
