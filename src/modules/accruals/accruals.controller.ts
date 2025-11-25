import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AccrualsService } from './accruals.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { AccrualFilterDto } from './dto/accrual-filter.dto';

@Controller('accruals')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class AccrualsController {
  constructor(private readonly accrualsService: AccrualsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: AccrualFilterDto,
  ) {
    return this.accrualsService.findAll(
      user?.organizationId as string,
      filters,
    );
  }

  @Get('summary/pending-count')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async pendingCount(@CurrentUser() user: AuthenticatedUser) {
    const count = await this.accrualsService.pendingCount(
      user?.organizationId as string,
    );
    return { pending: count };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async get(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accrualsService.findById(
      user?.organizationId as string,
      id,
    );
  }
}

