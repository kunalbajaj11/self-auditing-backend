import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CreditNotesService } from './credit-notes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@Controller('credit-notes')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class CreditNotesController {
  constructor(private readonly creditNotesService: CreditNotesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.creditNotesService.findAll(
      user?.organizationId as string,
    );
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async get(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.creditNotesService.findById(
      user?.organizationId as string,
      id,
    );
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: any, // CreateCreditNoteDto
  ) {
    return this.creditNotesService.create(
      user?.organizationId as string,
      user?.id as string,
      dto,
    );
  }

  @Post(':id/apply')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async apply(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: { invoiceId: string; appliedAmount: number },
  ) {
    return this.creditNotesService.applyCreditNoteToInvoice(
      user?.organizationId as string,
      id,
      dto.invoiceId,
      dto.appliedAmount,
    );
  }
}

