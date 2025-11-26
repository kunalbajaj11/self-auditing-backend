import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { ChartOfAccountFilterDto } from './dto/chart-of-account-filter.dto';

@Controller('chart-of-accounts')
export class ChartOfAccountsController {
  constructor(
    private readonly chartOfAccountsService: ChartOfAccountsService,
  ) {}

  @Get('tree')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getTree(@CurrentUser() user: AuthenticatedUser) {
    return this.chartOfAccountsService.getTree(
      user?.organizationId as string,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: ChartOfAccountFilterDto,
  ) {
    return this.chartOfAccountsService.findAll(
      user?.organizationId as string,
      filters,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async get(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chartOfAccountsService.findById(
      user?.organizationId as string,
      id,
    );
  }
}

