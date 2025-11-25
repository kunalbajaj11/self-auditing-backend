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
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { EnterpriseLicenseGuard } from '../../common/guards/enterprise-license.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { NotificationFilterDto } from './dto/notification-filter.dto';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { MarkNotificationDto } from './dto/mark-read.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, EnterpriseLicenseGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: NotificationFilterDto,
  ) {
    return this.notificationsService.findForUser(
      user?.organizationId as string,
      user?.userId as string,
      filters,
    );
  }

  @Post()
  @Roles(UserRole.ADMIN)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateNotificationDto,
  ) {
    return this.notificationsService.createManual(
      user?.organizationId as string,
      dto,
    );
  }

  @Patch(':id/read')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async markRead(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarkNotificationDto,
  ) {
    return this.notificationsService.markAsRead(
      user?.organizationId as string,
      user?.userId as string,
      id,
      dto,
    );
  }
}

