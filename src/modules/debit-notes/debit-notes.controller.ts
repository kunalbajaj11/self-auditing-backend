import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { DebitNotesService } from './debit-notes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { DebitNoteStatus } from '../../common/enums/debit-note-status.enum';

@Controller('debit-notes')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class DebitNotesController {
  constructor(private readonly debitNotesService: DebitNotesService) {}

  @Get('next-debit-note-number')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getNextDebitNoteNumber(@CurrentUser() user: AuthenticatedUser) {
    const debitNoteNumber = await this.debitNotesService.getNextDebitNoteNumber(
      user?.organizationId as string,
    );
    return { debitNoteNumber };
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.debitNotesService.findAll(user?.organizationId as string);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.debitNotesService.findById(user?.organizationId as string, id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: any, // CreateDebitNoteDto
  ) {
    return this.debitNotesService.create(
      user?.organizationId as string,
      user?.userId as string,
      dto,
    );
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: any, // UpdateDebitNoteDto
  ) {
    return this.debitNotesService.update(
      user?.organizationId as string,
      id,
      user?.userId as string,
      dto,
    );
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: { status: DebitNoteStatus },
  ) {
    return this.debitNotesService.updateStatus(
      user?.organizationId as string,
      id,
      user?.userId as string,
      dto.status,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.debitNotesService.delete(
      user?.organizationId as string,
      id,
      user?.userId as string,
    );
    return { message: 'Debit note deleted successfully' };
  }

  @Post(':id/apply')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async apply(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: { invoiceId: string; appliedAmount: number },
  ) {
    return this.debitNotesService.applyDebitNoteToInvoice(
      user?.organizationId as string,
      id,
      dto.invoiceId,
      dto.appliedAmount,
    );
  }
}
