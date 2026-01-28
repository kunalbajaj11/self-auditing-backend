import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { PurchaseOrdersService } from './purchase-orders.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { PurchaseOrderStatus } from '../../common/enums/purchase-order-status.enum';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { PurchaseOrderFilterDto } from './dto/purchase-order-filter.dto';
import { ReceiveItemsDto } from './dto/receive-items.dto';
import { ConvertToExpenseDto } from './dto/convert-to-expense.dto';

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: PurchaseOrderFilterDto,
  ) {
    return this.purchaseOrdersService.findAll(
      user?.organizationId as string,
      filters,
    );
  }

  @Get('next-po-number')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getNextPONumber(@CurrentUser() user: AuthenticatedUser) {
    const poNumber = await this.purchaseOrdersService.getNextPONumber(
      user?.organizationId as string,
    );
    return { poNumber };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.purchaseOrdersService.findById(
      user?.organizationId as string,
      id,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.create(
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
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.update(
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
    @Body() dto: { status: PurchaseOrderStatus },
  ) {
    return this.purchaseOrdersService.updateStatus(
      user?.organizationId as string,
      id,
      user?.userId as string,
      dto.status,
    );
  }

  @Post(':id/send')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async sendToVendor(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: { email?: string },
  ) {
    return this.purchaseOrdersService.sendToVendor(
      user?.organizationId as string,
      id,
      user?.userId as string,
      dto.email,
    );
  }

  @Get(':id/pdf')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async downloadPOPDF(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.purchaseOrdersService.generatePOPDF(
      id,
      user?.organizationId as string,
    );

    const po = await this.purchaseOrdersService.findById(
      user?.organizationId as string,
      id,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="purchase-order-${po.poNumber}.pdf"`,
    );
    res.send(pdfBuffer);
  }

  @Post(':id/send-email')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async sendPOEmail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    emailData: {
      recipientEmail: string;
      subject?: string;
      message?: string;
    },
  ) {
    await this.purchaseOrdersService.sendPOEmail(
      id,
      user?.organizationId as string,
      user?.userId as string,
      emailData,
    );
    return { message: 'Purchase order email sent successfully' };
  }

  @Post(':id/receive')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async receiveItems(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReceiveItemsDto,
  ) {
    return this.purchaseOrdersService.receiveItems(
      user?.organizationId as string,
      id,
      user?.userId as string,
      dto,
    );
  }

  @Post(':id/convert-to-expense')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async convertToExpense(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConvertToExpenseDto,
  ) {
    return this.purchaseOrdersService.convertToExpense(
      user?.organizationId as string,
      id,
      user?.userId as string,
      dto,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.purchaseOrdersService.delete(
      user?.organizationId as string,
      id,
      user?.userId as string,
    );
    return { message: 'Purchase order deleted successfully' };
  }
}
