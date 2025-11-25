import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  SuperAdminService,
  DashboardMetrics,
  OrganizationUsageItem,
} from './super-admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@Controller('super-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get('dashboard')
  async getDashboard(
    @Query('forceRefresh') forceRefresh?: string,
  ): Promise<DashboardMetrics> {
    const shouldForceRefresh = forceRefresh === 'true';
    return this.superAdminService.getDashboardMetrics(shouldForceRefresh);
  }

  @Get('usage')
  async getUsage(
    @Query('forceRefresh') forceRefresh?: string,
  ): Promise<OrganizationUsageItem[]> {
    const shouldForceRefresh = forceRefresh === 'true';
    return this.superAdminService.getOrganizationUsage(shouldForceRefresh);
  }

  @Get('audit-logs')
  async getAuditLogs(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const skipNum = skip ? parseInt(skip, 10) : 0;
    return this.superAdminService.getLatestAuditLogs(limitNum, skipNum);
  }
}

