import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ExpenseTypesService } from './expense-types.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CreateExpenseTypeDto } from './dto/create-expense-type.dto';
import { UpdateExpenseTypeDto } from './dto/update-expense-type.dto';

@Controller('expense-types')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class ExpenseTypesController {
  constructor(private readonly expenseTypesService: ExpenseTypesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async list(@CurrentUser() user: AuthenticatedUser) {
    await this.expenseTypesService.ensureDefaultsForOrganization(
      user?.organizationId as string,
    );
    return this.expenseTypesService.findAllByOrganization(
      user?.organizationId as string,
      user?.userId as string,
    );
  }

  @Post()
  @Roles(UserRole.ADMIN)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateExpenseTypeDto,
  ) {
    return this.expenseTypesService.create(
      user?.organizationId as string,
      user?.userId as string,
      dto,
    );
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateExpenseTypeDto,
  ) {
    return this.expenseTypesService.update(
      id,
      user?.organizationId as string,
      dto,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.expenseTypesService.remove(id, user?.organizationId as string);
    return { success: true };
  }
}
