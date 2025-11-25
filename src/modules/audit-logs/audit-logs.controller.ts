import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @UseGuards(TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getForOrganization(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: AuditLogFilterDto,
  ) {
    return this.auditLogsService.listForOrganization(
      user?.organizationId as string,
      filters,
    );
  }

  @Get('organization/:id')
  @Roles(UserRole.SUPERADMIN)
  async getForSpecificOrganization(
    @Param('id') organizationId: string,
    @Query() filters: AuditLogFilterDto,
  ) {
    return this.auditLogsService.listForOrganization(organizationId, filters);
  }
}

