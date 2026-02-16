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
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { CreditNotesService } from './credit-notes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CreditNoteStatus } from '../../common/enums/credit-note-status.enum';

@Controller('credit-notes')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class CreditNotesController {
  constructor(private readonly creditNotesService: CreditNotesService) {}

  @Get('next-credit-note-number')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getNextCreditNoteNumber(@CurrentUser() user: AuthenticatedUser) {
    const creditNoteNumber =
      await this.creditNotesService.getNextCreditNoteNumber(
        user?.organizationId as string,
      );
    return { creditNoteNumber };
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.creditNotesService.findAll(user?.organizationId as string);
  }

  @Get(':id/pdf')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async downloadPDF(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.creditNotesService.generateCreditNotePDF(
      id,
      user?.organizationId as string,
    );
    const creditNote = await this.creditNotesService.findById(
      user?.organizationId as string,
      id,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="credit-note-${creditNote.creditNoteNumber}.pdf"`,
    );
    res.send(pdfBuffer);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.creditNotesService.findById(user?.organizationId as string, id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: any, // CreateCreditNoteDto
  ) {
    return this.creditNotesService.create(
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
    @Body() dto: any, // UpdateCreditNoteDto
  ) {
    return this.creditNotesService.update(
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
    @Body() dto: { status: CreditNoteStatus },
  ) {
    return this.creditNotesService.updateStatus(
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
    await this.creditNotesService.delete(
      user?.organizationId as string,
      id,
      user?.userId as string,
    );
    return { message: 'Credit note deleted successfully' };
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
