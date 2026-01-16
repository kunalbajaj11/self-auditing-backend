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
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { ChangeOrganizationStatusDto } from './dto/change-status.dto';
import { ActivateOrganizationWithExpiryDto } from './dto/activate-with-expiry.dto';
import { UpgradeLicenseDto } from './dto/upgrade-license.dto';
import { ChangePlanTypeDto } from './dto/change-plan-type.dto';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @Roles(UserRole.SUPERADMIN)
  async list() {
    const organizations = await this.organizationsService.findAll();
    return organizations.map((org) => ({
      id: org.id,
      name: org.name,
      planType: org.planType,
      status: org.status,
      contactEmail: org.contactEmail,
      createdAt: org.createdAt,
      plan: org.plan
        ? {
            id: org.plan.id,
            name: org.plan.name,
          }
        : null,
    }));
  }

  @Post()
  @Roles(UserRole.SUPERADMIN)
  async create(@Body() dto: CreateOrganizationDto) {
    const organization = await this.organizationsService.create(dto);
    return {
      id: organization.id,
      name: organization.name,
      planType: organization.planType,
      status: organization.status,
    };
  }

  @Get('me')
  @UseGuards(TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async getMyOrganization(@CurrentUser() user: AuthenticatedUser) {
    const organization = await this.organizationsService.findById(
      user?.organizationId as string,
    );
    return {
      id: organization.id,
      name: organization.name,
      currency: organization.currency,
      planType: organization.planType,
      status: organization.status,
      storageQuotaMb: organization.storageQuotaMb,
      contactPerson: organization.contactPerson,
      contactEmail: organization.contactEmail,
      enablePayroll: organization.enablePayroll,
      enableInventory: organization.enableInventory,
    };
  }

  @Patch('me')
  @UseGuards(TenantGuard)
  @Roles(UserRole.ADMIN)
  async updateMyOrganization(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateOrganizationDto,
  ) {
    const updated = await this.organizationsService.update(
      user?.organizationId as string,
      dto,
    );
    return {
      id: updated.id,
      name: updated.name,
      currency: updated.currency,
      status: updated.status,
      contactPerson: updated.contactPerson,
      contactEmail: updated.contactEmail,
      storageQuotaMb: updated.storageQuotaMb,
      planType: updated.planType,
    };
  }

  @Post(':id/upgrade-license')
  @Roles(UserRole.SUPERADMIN)
  async upgradeLicense(
    @Param('id', new ParseUUIDPipe()) organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpgradeLicenseDto,
  ) {
    const updated = await this.organizationsService.upgradeLicense(
      organizationId,
      user?.userId as string,
      dto,
    );
    return {
      id: updated.id,
      name: updated.name,
      planType: updated.planType,
      status: updated.status,
      storageQuotaMb: updated.storageQuotaMb,
      message: 'License upgraded successfully',
    };
  }

  @Patch(':id/plan-type')
  @Roles(UserRole.SUPERADMIN)
  async changePlanType(
    @Param('id', new ParseUUIDPipe()) organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePlanTypeDto,
  ) {
    const updated = await this.organizationsService.changePlanType(
      organizationId,
      user?.userId as string,
      dto,
    );
    return {
      id: updated.id,
      name: updated.name,
      planType: updated.planType,
      status: updated.status,
      storageQuotaMb: updated.storageQuotaMb,
      message: 'Plan type changed successfully',
    };
  }

  @Patch(':id/status')
  @Roles(UserRole.SUPERADMIN)
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeOrganizationStatusDto,
  ) {
    return this.organizationsService.changeStatus(id, dto);
  }

  @Patch(':id/activate')
  @Roles(UserRole.SUPERADMIN)
  async activateWithExpiry(
    @Param('id') id: string,
    @Body() dto: ActivateOrganizationWithExpiryDto,
  ) {
    return this.organizationsService.activateWithExpiry(id, dto);
  }

  @Get(':id')
  @Roles(UserRole.SUPERADMIN)
  async get(@Param('id') id: string) {
    return this.organizationsService.findById(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPERADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.update(id, dto);
  }
}
