import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ExpensePaymentsService } from './expense-payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CreateExpensePaymentDto } from './dto/create-expense-payment.dto';

@Controller('expense-payments')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class ExpensePaymentsController {
  constructor(
    private readonly expensePaymentsService: ExpensePaymentsService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.expensePaymentsService.findAll(
      user?.organizationId as string,
    );
  }

  @Get('expense/:expenseId')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getByExpense(
    @Param('expenseId') expenseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.expensePaymentsService.findByExpense(
      user?.organizationId as string,
      expenseId,
    );
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async get(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.expensePaymentsService.findById(
      user?.organizationId as string,
      id,
    );
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateExpensePaymentDto,
  ) {
    return this.expensePaymentsService.create(
      user?.organizationId as string,
      user?.userId as string,
      dto,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.expensePaymentsService.delete(
      user?.organizationId as string,
      id,
    );
    return { message: 'Payment deleted successfully' };
  }

  @Get('pending-invoices/:vendorName')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getPendingInvoicesByVendor(
    @Param('vendorName') vendorName: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.expensePaymentsService.getPendingInvoicesByVendor(
      user?.organizationId as string,
      decodeURIComponent(vendorName),
    );
  }
}

