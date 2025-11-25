import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseFilterDto } from './dto/expense-filter.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { UpdateExpenseStatusDto } from './dto/update-status.dto';
import { LinkAccrualDto } from './dto/link-accrual.dto';

@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: ExpenseFilterDto,
  ) {
    const scopedFilters = { ...filters };
    if (user?.role === UserRole.EMPLOYEE) {
      scopedFilters.createdBy = user.userId;
    }
    return this.expensesService.findAll(
      user?.organizationId as string,
      scopedFilters,
    );
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async get(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.expensesService.findById(
      id,
      user?.organizationId as string,
    );
  }

  @Post()
  @Roles(
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.APPROVER,
    UserRole.EMPLOYEE,
  )
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expensesService.create(
      user?.organizationId as string,
      user?.userId as string,
      dto,
    );
  }

  @Post('check-duplicates')
  @Roles(
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.APPROVER,
    UserRole.EMPLOYEE,
  )
  async checkDuplicates(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expensesService.checkDuplicates(
      user?.organizationId as string,
      dto,
    );
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.update(
      id,
      user?.organizationId as string,
      dto,
    );
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.APPROVER)
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateExpenseStatusDto,
  ) {
    return this.expensesService.updateStatus(
      id,
      user?.organizationId as string,
      dto,
    );
  }

  @Post(':id/link-accrual')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async linkAccrual(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LinkAccrualDto,
  ) {
    return this.expensesService.linkAccrual(
      id,
      user?.organizationId as string,
      dto,
    );
  }
}

