import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SalesInvoicesService } from './sales-invoices.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { SalesInvoiceFilterDto } from './dto/sales-invoice-filter.dto';

@Controller('sales-invoices')
export class SalesInvoicesController {
  constructor(
    private readonly salesInvoicesService: SalesInvoicesService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: SalesInvoiceFilterDto,
  ) {
    // If paymentStatus is 'overdue', map it to invoice status 'overdue'
    if (filters.paymentStatus === 'overdue') {
      filters.status = InvoiceStatus.OVERDUE;
      delete filters.paymentStatus; // Remove to avoid validation error
    }
    return this.salesInvoicesService.findAll(
      user?.organizationId as string,
      filters,
    );
  }

  @Get('public/:token')
  async getPublicInvoice(@Param('token') token: string) {
    return this.salesInvoicesService.findByPublicToken(token);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async get(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesInvoicesService.findById(
      user?.organizationId as string,
      id,
    );
  }

  @Get(':id/preview')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async getInvoicePreview(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesInvoicesService.getInvoicePreviewData(
      id,
      user?.organizationId as string,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: any, // CreateSalesInvoiceDto
  ) {
    return this.salesInvoicesService.create(
      user?.organizationId as string,
      user?.id as string,
      dto,
    );
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: any, // UpdateSalesInvoiceDto
  ) {
    // Implementation for update
    return { message: 'Update not yet implemented' };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Implementation for delete
    return { message: 'Delete not yet implemented' };
  }
}

