import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { SalesOrdersService } from './sales-orders.service';
import { SalesOrderFilterDto } from './dto/sales-order-filter.dto';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { UpdateSalesOrderDto } from './dto/update-sales-order.dto';
import { SalesOrderStatus } from '../../common/enums/sales-order-status.enum';

@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly salesOrdersService: SalesOrdersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: SalesOrderFilterDto,
  ) {
    return this.salesOrdersService.findAll(
      user?.organizationId as string,
      filters,
    );
  }

  @Get('next-so-number')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getNextSONumber(@CurrentUser() user: AuthenticatedUser) {
    const soNumber = await this.salesOrdersService.getNextSONumber(
      user?.organizationId as string,
    );
    return { soNumber };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.salesOrdersService.findById(user?.organizationId as string, id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSalesOrderDto,
  ) {
    return this.salesOrdersService.create(
      user?.organizationId as string,
      user?.userId as string,
      dto,
    );
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSalesOrderDto,
  ) {
    return this.salesOrdersService.update(
      user?.organizationId as string,
      id,
      user?.userId as string,
      dto,
    );
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: { status: SalesOrderStatus },
  ) {
    return this.salesOrdersService.updateStatus(
      user?.organizationId as string,
      id,
      user?.userId as string,
      dto.status,
    );
  }

  @Post(':id/send')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async sendToCustomer(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: { email?: string },
  ) {
    return this.salesOrdersService.sendToCustomer(
      user?.organizationId as string,
      id,
      user?.userId as string,
      dto.email,
    );
  }

  @Get(':id/pdf')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async downloadPDF(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.salesOrdersService.generateSalesOrderPDF(
      id,
      user?.organizationId as string,
    );
    const so = await this.salesOrdersService.findById(
      user?.organizationId as string,
      id,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sales-order-${so.soNumber}.pdf"`,
    );
    res.send(pdfBuffer);
  }

  @Post(':id/send-email')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async sendEmail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    emailData: {
      recipientEmail: string;
      subject?: string;
      message?: string;
    },
  ) {
    await this.salesOrdersService.sendSalesOrderEmail(
      id,
      user?.organizationId as string,
      user?.userId as string,
      emailData,
    );
    return { message: 'Sales order email sent successfully' };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.salesOrdersService.delete(
      user?.organizationId as string,
      id,
      user?.userId as string,
    );
    return { message: 'Sales order deleted successfully' };
  }
}
