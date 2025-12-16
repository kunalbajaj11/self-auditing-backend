import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangeUserStatusDto } from './dto/change-status.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    if (!user) {
      return null;
    }
    const entity = await this.usersService.findById(user.userId);
    return {
      id: entity.id,
      name: entity.name,
      email: entity.email,
      role: entity.role,
      organization: entity.organization
        ? {
            id: entity.organization.id,
            name: entity.organization.name,
          }
        : null,
      status: entity.status,
      lastLogin: entity.lastLogin,
    };
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async list(@CurrentUser() user: AuthenticatedUser) {
    const users = await this.usersService.findAllByOrganization(
      user?.organizationId as string,
    );
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      phone: u.phone,
      status: u.status,
      lastLogin: u.lastLogin,
    }));
  }

  @Get('limit-info')
  @Roles(UserRole.ADMIN)
  async getLimitInfo(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getUserLimitInfo(user?.organizationId as string);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUserDto,
  ) {
    const created = await this.usersService.createForOrganization(
      user?.organizationId as string,
      dto,
      [UserRole.ACCOUNTANT, UserRole.EMPLOYEE],
    );
    return {
      id: created.id,
      name: created.name,
      email: created.email,
      role: created.role,
      phone: created.phone,
      status: created.status,
    };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateUserDto,
  ) {
    const updated = await this.usersService.updateUser(
      id,
      user?.organizationId as string,
      dto,
    );
    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      phone: updated.phone,
      status: updated.status,
    };
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  async changeStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangeUserStatusDto,
  ) {
    const updated = await this.usersService.changeStatus(
      id,
      user?.organizationId as string,
      dto,
    );
    return {
      id: updated.id,
      status: updated.status,
    };
  }
}
