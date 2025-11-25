import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { VendorsService, VendorFilterDto, DateFilterDto } from './vendors.service';
import { Vendor } from './vendor.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

@Controller('vendors')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.APPROVER)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: VendorFilterDto,
  ) {
    return this.vendorsService.findAll(
      user?.organizationId as string,
      filters,
    );
  }

  @Get('search')
  @Roles(
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.APPROVER,
    UserRole.EMPLOYEE,
  )
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query: string,
  ) {
    return this.vendorsService.search(
      user?.organizationId as string,
      query,
    );
  }

  @Get('top')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.AUDITOR)
  async topVendors(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: DateFilterDto,
    @Query('limit') limit?: string,
  ) {
    return this.vendorsService.getTopVendors(
      user?.organizationId as string,
      limit ? parseInt(limit, 10) : 10,
      filters.startDate,
      filters.endDate,
    );
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.APPROVER)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.vendorsService.findById(
      user?.organizationId as string,
      id,
    );
  }

  @Get(':id/spend')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.AUDITOR)
  async getSpend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() filters: DateFilterDto,
  ) {
    return this.vendorsService.getVendorSpend(
      user?.organizationId as string,
      id,
      filters.startDate,
      filters.endDate,
    );
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVendorDto,
  ) {
    return this.vendorsService.create(
      user?.organizationId as string,
      dto,
    );
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendorsService.update(
      user?.organizationId as string,
      id,
      dto,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.vendorsService.delete(
      user?.organizationId as string,
      id,
    );
    return { message: 'Vendor deleted successfully' };
  }
}

