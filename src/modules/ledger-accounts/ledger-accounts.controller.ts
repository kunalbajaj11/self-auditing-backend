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
import { LedgerAccountsService } from './ledger-accounts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CreateLedgerAccountDto } from './dto/create-ledger-account.dto';
import { UpdateLedgerAccountDto } from './dto/update-ledger-account.dto';

@Controller('ledger-accounts')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class LedgerAccountsController {
  constructor(private readonly ledgerAccountsService: LedgerAccountsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ledgerAccountsService.findAllByOrganization(
      user?.organizationId as string,
      user?.userId as string,
    );
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLedgerAccountDto,
  ) {
    return this.ledgerAccountsService.create(
      user?.organizationId as string,
      user?.userId as string,
      dto,
    );
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateLedgerAccountDto,
  ) {
    return this.ledgerAccountsService.update(
      id,
      user?.organizationId as string,
      dto,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.ledgerAccountsService.remove(id, user?.organizationId as string);
    return { success: true };
  }
}

