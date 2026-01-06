import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { TaxFormsService } from './tax-forms.service';
import { TaxFormGeneratorService } from './tax-form-generator.service';
import { GenerateVATReturnDto } from './dto/generate-vat-return.dto';
import { UpdateTaxFormDto } from './dto/update-tax-form.dto';
import { TaxFormType } from '../../entities/tax-form.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';

@Controller('tax-forms')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class TaxFormsController {
  constructor(
    private readonly taxFormsService: TaxFormsService,
    private readonly formGeneratorService: TaxFormGeneratorService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getTaxForms(
    @CurrentUser() user: AuthenticatedUser,
    @Query('formType') formType?: TaxFormType,
    @Query('period') period?: string,
  ) {
    return this.taxFormsService.getTaxForms(
      user?.organizationId as string,
      formType,
      period,
    );
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getTaxForm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.taxFormsService.getTaxFormById(
      id,
      user?.organizationId as string,
    );
  }

  @Post('generate-vat-return')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async generateVATReturn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateVATReturnDto,
  ) {
    // Extract data
    const data = await this.taxFormsService.extractVATReturnData(
      user?.organizationId as string,
      dto.period,
    );

    // Validate
    const validation = this.taxFormsService.validateVATReturn(data);

    // Get organization
    const organization = await this.taxFormsService['organizationsRepository'].findOne({
      where: { id: user?.organizationId as string },
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    // Generate form file
    const format = dto.format || 'pdf';
    const fileBuffer = await this.formGeneratorService.generateVATReturn(
      dto.formType,
      data,
      organization,
      { format },
    );

    // Save form record
    const taxForm = await this.taxFormsService.createOrUpdateTaxForm(
      user?.organizationId as string,
      dto.formType,
      dto.period,
      data as any,
      user?.userId as string,
    );

    // Update validation errors/warnings
    taxForm.validationErrors = validation.errors.length > 0 ? validation.errors : null;
    taxForm.validationWarnings = validation.warnings.length > 0 ? validation.warnings : null;
    await (this.taxFormsService as any).taxFormsRepository.save(taxForm);

    return {
      form: taxForm,
      validation,
      file: {
        buffer: fileBuffer.toString('base64'),
        format,
        filename: `${dto.formType}_${dto.period}.${format}`,
      },
    };
  }

  @Post('generate-vat-return/download')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async downloadVATReturn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateVATReturnDto,
    @Res() res: Response,
  ) {
    // Extract data
    const data = await this.taxFormsService.extractVATReturnData(
      user?.organizationId as string,
      dto.period,
    );

    // Get organization
    const organization = await this.taxFormsService['organizationsRepository'].findOne({
      where: { id: user?.organizationId as string },
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    // Generate form file
    const format = dto.format || 'pdf';
    const fileBuffer = await this.formGeneratorService.generateVATReturn(
      dto.formType,
      data,
      organization,
      { format },
    );

    // Set response headers
    const contentType =
      format === 'pdf'
        ? 'application/pdf'
        : format === 'excel'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv';

    const filename = `${dto.formType}_${dto.period}.${format}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(fileBuffer);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async updateTaxForm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaxFormDto,
  ) {
    const form = await this.taxFormsService.getTaxFormById(
      id,
      user?.organizationId as string,
    );

    if (dto.status) form.status = dto.status;
    if (dto.formData) form.formData = dto.formData;
    if (dto.notes !== undefined) form.notes = dto.notes;
    if (dto.filingReference) form.filingReference = dto.filingReference;
    if (dto.filingDate) form.filingDate = new Date(dto.filingDate);

    return (this.taxFormsService as any).taxFormsRepository.save(form);
  }

  @Post(':id/file')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async markFormAsFiled(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { filingReference: string },
  ) {
    return this.taxFormsService.markFormAsFiled(
      id,
      user?.organizationId as string,
      body.filingReference,
      user?.userId as string,
    );
  }
}

