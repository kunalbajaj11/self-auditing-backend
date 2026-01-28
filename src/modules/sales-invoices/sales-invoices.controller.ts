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
import { CreatePaymentDto } from './dto/create-payment.dto';

@Controller('sales-invoices')
export class SalesInvoicesController {
  constructor(private readonly salesInvoicesService: SalesInvoicesService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: SalesInvoiceFilterDto,
  ) {
    // If paymentStatus filter is 'overdue', map it to invoice status 'overdue'
    // Note: 'overdue' is not a PaymentStatus, it's an InvoiceStatus
    if ((filters.paymentStatus as any) === 'overdue') {
      filters.status = InvoiceStatus.OVERDUE;
      delete filters.paymentStatus; // Remove to avoid validation error
    }
    return this.salesInvoicesService.findAll(
      user?.organizationId as string,
      filters,
    );
  }

  @Get('next-invoice-number')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getNextInvoiceNumber(@CurrentUser() user: AuthenticatedUser) {
    const invoiceNumber = await this.salesInvoicesService.getNextInvoiceNumber(
      user?.organizationId as string,
    );
    return { invoiceNumber };
  }

  @Get('item-suggestions')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getItemSuggestions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') searchTerm?: string,
  ) {
    return this.salesInvoicesService.getItemSuggestions(
      user?.organizationId as string,
      searchTerm,
    );
  }

  @Get('payments')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async listAllPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('paymentMethod') paymentMethod?: string,
  ) {
    return this.salesInvoicesService.listAllPayments(
      user?.organizationId as string,
      paymentMethod ? { paymentMethod: paymentMethod as any } : undefined,
    );
  }

  @Get('public/:token')
  async getPublicInvoice(@Param('token') token: string) {
    return this.salesInvoicesService.findByPublicToken(token);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
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

  @Get(':id/pdf')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async downloadInvoicePDF(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.salesInvoicesService.generateInvoicePDF(
      id,
      user?.organizationId as string,
    );

    const invoice = await this.salesInvoicesService.findById(
      user?.organizationId as string,
      id,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`,
    );
    res.send(pdfBuffer);
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
    @Body() dto: { status: InvoiceStatus },
  ) {
    return this.salesInvoicesService.updateStatus(
      user?.organizationId as string,
      id,
      user?.userId as string,
      dto.status,
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
    return this.salesInvoicesService.update(
      user?.organizationId as string,
      id,
      user?.userId as string,
      dto,
    );
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async patch(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: any, // UpdateSalesInvoiceDto
  ) {
    return this.salesInvoicesService.update(
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
    await this.salesInvoicesService.delete(
      user?.organizationId as string,
      id,
      user?.userId as string,
    );
    return { message: 'Invoice deleted successfully' };
  }

  @Post(':id/payments')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async recordPayment(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.salesInvoicesService.recordPayment(
      user?.organizationId as string,
      id,
      user?.userId as string,
      dto,
    );
  }

  @Get(':id/payments')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async listPayments(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesInvoicesService.listPayments(
      user?.organizationId as string,
      id,
    );
  }

  @Delete(':id/payments/:paymentId')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async deletePayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.salesInvoicesService.deletePayment(
      user?.organizationId as string,
      id,
      paymentId,
      user?.userId as string,
    );
    return { message: 'Payment deleted successfully' };
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
    await this.salesInvoicesService.sendInvoiceEmail(
      id,
      user?.organizationId as string,
      user?.userId as string,
      emailData,
    );
    return { message: 'Invoice email sent successfully' };
  }

  @Post(':id/convert')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async convertProformaToInvoice(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesInvoicesService.convertProformaToInvoice(
      user?.organizationId as string,
      id,
      user?.userId as string,
    );
  }
}
