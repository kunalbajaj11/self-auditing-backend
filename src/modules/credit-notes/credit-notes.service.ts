import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CreditNote } from '../../entities/credit-note.entity';
import { CreditNoteApplication } from '../../entities/credit-note-application.entity';
import { CreditNoteLineItem } from '../../entities/credit-note-line-item.entity';
import { NumberingSequenceType } from '../../entities/numbering-sequence.entity';
import { SettingsService } from '../settings/settings.service';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { CreditNoteStatus } from '../../common/enums/credit-note-status.enum';
import { PaymentStatus } from '../../common/enums/payment-status.enum';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { SalesInvoicesService } from '../sales-invoices/sales-invoices.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ReportGeneratorService } from '../reports/report-generator.service';

@Injectable()
export class CreditNotesService {
  constructor(
    @InjectRepository(CreditNote)
    private readonly creditNotesRepository: Repository<CreditNote>,
    @InjectRepository(CreditNoteApplication)
    private readonly creditNoteApplicationsRepository: Repository<CreditNoteApplication>,
    @InjectRepository(CreditNoteLineItem)
    private readonly creditNoteLineItemsRepository: Repository<CreditNoteLineItem>,
    @InjectRepository(SalesInvoice)
    private readonly invoicesRepository: Repository<SalesInvoice>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly salesInvoicesService: SalesInvoicesService,
    private readonly auditLogsService: AuditLogsService,
    private readonly settingsService: SettingsService,
    private readonly reportGeneratorService: ReportGeneratorService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(organizationId: string): Promise<CreditNote[]> {
    return this.creditNotesRepository.find({
      where: { organization: { id: organizationId }, isDeleted: false },
      relations: ['customer', 'invoice'],
      order: { creditNoteDate: 'DESC' },
    });
  }

  async findById(organizationId: string, id: string): Promise<CreditNote> {
    const creditNote = await this.creditNotesRepository.findOne({
      where: { id, organization: { id: organizationId }, isDeleted: false },
      relations: ['customer', 'invoice', 'applications', 'lineItems'],
    });
    if (!creditNote) {
      throw new NotFoundException('Credit note not found');
    }
    if (creditNote.lineItems?.length) {
      creditNote.lineItems.sort(
        (a, b) => (a.lineNumber || 0) - (b.lineNumber || 0),
      );
    }
    return creditNote;
  }

  /**
   * Generate Credit Note PDF (single-page document with company, customer, amounts)
   */
  async generateCreditNotePDF(
    id: string,
    organizationId: string,
  ): Promise<Buffer> {
    const creditNote = await this.creditNotesRepository.findOne({
      where: { id, organization: { id: organizationId }, isDeleted: false },
      relations: ['organization', 'customer', 'invoice', 'user', 'lineItems'],
    });
    if (!creditNote) {
      throw new NotFoundException('Credit note not found');
    }
    if (creditNote.lineItems?.length) {
      creditNote.lineItems.sort(
        (a, b) => (a.lineNumber || 0) - (b.lineNumber || 0),
      );
    }

    const templateSettings =
      await this.settingsService.getInvoiceTemplate(organizationId);
    const logoBuffer =
      await this.settingsService.getInvoiceLogoBuffer(organizationId);

    const reportData = {
      type: 'credit_note',
      data: creditNote,
      metadata: {
        organizationName: creditNote.organization?.name,
        currency: creditNote.currency || 'AED',
        generatedAt: new Date(),
        generatedByName: creditNote.user?.name,
        organizationId: creditNote.organization?.id,
        invoiceTemplate: {
          logoBuffer: logoBuffer ?? undefined,
          showCompanyDetails: templateSettings?.invoiceShowCompanyDetails ?? true,
          showFooter: templateSettings?.invoiceShowFooter ?? true,
          footerText: templateSettings?.invoiceFooterText,
          headerText: templateSettings?.invoiceHeaderText,
          colorScheme: templateSettings?.invoiceColorScheme || 'blue',
          customColor: templateSettings?.invoiceCustomColor,
        },
      },
    };

    return this.reportGeneratorService.generatePDF(reportData);
  }

  async create(
    organizationId: string,
    userId: string,
    dto: any, // CreateCreditNoteDto
  ): Promise<CreditNote> {
    const [organization, user] = await Promise.all([
      this.organizationsRepository.findOne({ where: { id: organizationId } }),
      this.usersRepository.findOne({ where: { id: userId } }),
    ]);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate credit note number using centralized numbering sequence
    const creditNoteNumber = await this.settingsService.generateNextNumber(
      organizationId,
      NumberingSequenceType.CREDIT_NOTE,
    );

    let amount: number;
    let vatAmount: number;
    const lineItemsDto = Array.isArray(dto.lineItems) ? dto.lineItems : [];

    if (lineItemsDto.length > 0) {
      amount = lineItemsDto.reduce(
        (sum: number, li: any) => sum + parseFloat(li.amount || '0'),
        0,
      );
      vatAmount = lineItemsDto.reduce(
        (sum: number, li: any) => sum + parseFloat(li.vatAmount || '0'),
        0,
      );
    } else {
      amount = parseFloat(dto.amount);
      vatAmount = parseFloat(String(dto.vatAmount || 0));
    }

    const creditNote = this.creditNotesRepository.create({
      organization,
      user,
      creditNoteNumber,
      creditNoteDate: dto.creditNoteDate,
      reason: dto.reason,
      amount: amount.toString(),
      vatAmount: vatAmount.toString(),
      currency: dto.currency || 'AED',
      description: dto.description,
      notes: dto.notes,
      status: CreditNoteStatus.DRAFT,
      customer: dto.customerId ? { id: dto.customerId } : undefined,
      customerName: dto.customerName,
      customerTrn: dto.customerTrn,
      invoice: dto.invoiceId ? { id: dto.invoiceId } : undefined,
    });

    const saved = await this.creditNotesRepository.save(creditNote);

    if (lineItemsDto.length > 0) {
      const lineEntities = lineItemsDto.map((li: any, index: number) =>
        this.creditNoteLineItemsRepository.create({
          creditNote: { id: saved.id },
          organization: { id: organizationId },
          itemName: li.itemName || 'Item',
          quantity: String(li.quantity ?? 1),
          unitPrice: String(li.unitPrice ?? 0),
          vatRate: String(li.vatRate ?? 5),
          amount: String(li.amount ?? 0),
          vatAmount: String(li.vatAmount ?? 0),
          lineNumber: li.lineNumber ?? index + 1,
        }),
      );
      await this.creditNoteLineItemsRepository.save(lineEntities);
    }

    // If credit note is linked to an invoice, update the invoice's payment status
    if (saved.invoice?.id) {
      await this.salesInvoicesService.updatePaymentStatus(
        saved.invoice.id,
        organizationId,
      );
    }

    return this.findById(organizationId, saved.id);
  }

  /**
   * CRITICAL FIX: Apply credit note to invoice
   * This method does NOT reduce paidAmount - it creates a CreditNoteApplication record
   * Outstanding balance = totalAmount - paidAmount - appliedCreditNoteAmount
   */
  async applyCreditNoteToInvoice(
    organizationId: string,
    creditNoteId: string,
    invoiceId: string,
    appliedAmount: number,
  ): Promise<CreditNoteApplication> {
    const creditNote = await this.findById(organizationId, creditNoteId);
    const invoice = await this.invoicesRepository.findOne({
      where: { id: invoiceId, organization: { id: organizationId } },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (creditNote.status !== CreditNoteStatus.ISSUED) {
      throw new BadRequestException(
        'Credit note must be issued before applying to invoice',
      );
    }

    // Calculate outstanding balance (includes applied credit notes)
    const outstandingBalance =
      await this.salesInvoicesService.calculateOutstandingBalance(
        invoiceId,
        organizationId,
      );

    // Check if credit note has enough remaining amount
    // Pass organizationId to ensure we only count applications for this organization
    const totalApplied = await this.getTotalAppliedAmount(
      creditNoteId,
      organizationId,
    );
    const creditNoteTotal = parseFloat(creditNote.totalAmount || '0');
    // Round to 2 decimal places to avoid floating-point precision issues
    const remainingAmount =
      Math.round((creditNoteTotal - totalApplied) * 100) / 100;

    // Validate applied amount first
    const numericAppliedAmount = Number(appliedAmount);
    if (!Number.isFinite(numericAppliedAmount) || numericAppliedAmount <= 0) {
      throw new BadRequestException(
        'Applied amount must be a number greater than 0',
      );
    }

    // Use a small tolerance (0.01) for floating-point comparison
    const tolerance = 0.01;

    // Check if there's already an application for this specific invoice
    // If so, we should update it rather than create a duplicate
    const existingApplication =
      await this.creditNoteApplicationsRepository.findOne({
        where: {
          creditNote: { id: creditNoteId },
          invoice: { id: invoiceId },
          organization: { id: organizationId },
          isDeleted: false,
        },
      });

    if (existingApplication) {
      // Calculate remaining amount including the existing application
      const existingApplied = parseFloat(
        existingApplication.appliedAmount || '0',
      );
      const remainingIncludingExisting = remainingAmount + existingApplied;

      if (numericAppliedAmount > remainingIncludingExisting + tolerance) {
        throw new BadRequestException(
          `Applied amount (${numericAppliedAmount.toFixed(2)}) exceeds remaining credit note amount (${remainingIncludingExisting.toFixed(2)}). There is already an application of ${existingApplied.toFixed(2)} to this invoice.`,
        );
      }

      // Update existing application instead of creating a new one
      existingApplication.appliedAmount = numericAppliedAmount.toString();
      existingApplication.appliedDate = new Date().toISOString().split('T')[0];
      await this.creditNoteApplicationsRepository.save(existingApplication);

      // Recalculate total applied (excluding the old amount, including the new)
      const newTotalApplied =
        totalApplied - existingApplied + numericAppliedAmount;
      const fullyApplied = newTotalApplied >= creditNoteTotal;

      await this.creditNotesRepository.update(creditNote.id, {
        status: fullyApplied ? CreditNoteStatus.APPLIED : creditNote.status,
        appliedToInvoice: true,
        appliedAmount: fullyApplied
          ? creditNote.totalAmount
          : newTotalApplied.toString(),
      });

      await this.salesInvoicesService.updatePaymentStatus(
        invoiceId,
        organizationId,
      );

      return existingApplication;
    }

    // If remaining amount is 0 or negative and no existing application, throw error
    if (remainingAmount <= 0) {
      throw new BadRequestException(
        `Credit note has no remaining amount. Total: ${creditNoteTotal.toFixed(2)}, Already Applied: ${totalApplied.toFixed(2)}.`,
      );
    }

    // Effective available headroom on the invoice:
    // outstandingBalance already subtracts ALL unapplied credit notes (including this one).
    // We add this credit note's remaining amount back so we don't block applying it.
    const effectiveOutstanding = outstandingBalance + remainingAmount;
    if (numericAppliedAmount > remainingAmount + tolerance) {
      throw new BadRequestException(
        `Applied amount (${numericAppliedAmount.toFixed(2)}) exceeds remaining credit note amount (${remainingAmount.toFixed(2)})`,
      );
    }

    if (numericAppliedAmount > effectiveOutstanding + tolerance) {
      throw new BadRequestException(
        `Applied amount (${numericAppliedAmount.toFixed(2)}) exceeds outstanding balance (${effectiveOutstanding.toFixed(2)})`,
      );
    }

    // Create credit note application (DO NOT modify paidAmount)
    const application = this.creditNoteApplicationsRepository.create({
      creditNote,
      invoice,
      organization: { id: organizationId },
      appliedAmount: numericAppliedAmount.toString(),
      appliedDate: new Date().toISOString().split('T')[0],
    });

    await this.creditNoteApplicationsRepository.save(application);

    // Update credit note status if fully applied.
    // Use a direct update to avoid accidentally touching relations (like existing
    // credit_note_applications) which can cause FK issues.
    const newTotalApplied = totalApplied + numericAppliedAmount;
    const fullyApplied = newTotalApplied >= parseFloat(creditNote.totalAmount);

    await this.creditNotesRepository.update(creditNote.id, {
      status: fullyApplied ? CreditNoteStatus.APPLIED : creditNote.status,
      appliedToInvoice: true,
      appliedAmount: fullyApplied
        ? creditNote.totalAmount
        : newTotalApplied.toString(),
    });

    // Recalculate invoice payment status (this uses calculateOutstandingBalance)
    await this.salesInvoicesService.updatePaymentStatus(
      invoiceId,
      organizationId,
    );

    return application;
  }

  private async getTotalAppliedAmount(
    creditNoteId: string,
    organizationId?: string,
  ): Promise<number> {
    const whereClause: any = {
      creditNote: { id: creditNoteId },
      isDeleted: false,
    };
    if (organizationId) {
      whereClause.organization = { id: organizationId };
    }

    const applications = await this.creditNoteApplicationsRepository.find({
      where: whereClause,
    });
    const total = applications.reduce(
      (sum, app) => sum + parseFloat(app.appliedAmount || '0'),
      0,
    );
    // Round to 2 decimal places to avoid floating-point precision issues
    return Math.round(total * 100) / 100;
  }

  /**
   * Get next credit note number without creating a credit note
   * Useful for previewing the next number
   */
  async getNextCreditNoteNumber(organizationId: string): Promise<string> {
    return this.settingsService.getNextNumber(
      organizationId,
      NumberingSequenceType.CREDIT_NOTE,
    );
  }

  /**
   * Update credit note
   */
  async update(
    organizationId: string,
    creditNoteId: string,
    userId: string,
    dto: any, // UpdateCreditNoteDto
  ): Promise<CreditNote> {
    const creditNote = await this.findById(organizationId, creditNoteId);

    if (creditNote.status === CreditNoteStatus.APPLIED) {
      throw new BadRequestException('Cannot update applied credit note');
    }

    if (creditNote.status === CreditNoteStatus.CANCELLED) {
      throw new BadRequestException('Cannot update cancelled credit note');
    }

    // Update allowed fields
    if (dto.creditNoteDate !== undefined) {
      creditNote.creditNoteDate = dto.creditNoteDate;
    }
    if (dto.reason !== undefined) {
      creditNote.reason = dto.reason;
    }
    const lineItemsDto = Array.isArray(dto.lineItems) ? dto.lineItems : [];
    if (lineItemsDto.length > 0) {
      const amount = lineItemsDto.reduce(
        (sum: number, li: any) => sum + parseFloat(li.amount || '0'),
        0,
      );
      const vatAmount = lineItemsDto.reduce(
        (sum: number, li: any) => sum + parseFloat(li.vatAmount || '0'),
        0,
      );
      creditNote.amount = amount.toString();
      creditNote.vatAmount = vatAmount.toString();
      await this.creditNoteLineItemsRepository.delete({
        creditNote: { id: creditNoteId },
      });
      const lineEntities = lineItemsDto.map((li: any, index: number) =>
        this.creditNoteLineItemsRepository.create({
          creditNote: { id: creditNoteId },
          organization: { id: organizationId },
          itemName: li.itemName || 'Item',
          quantity: String(li.quantity ?? 1),
          unitPrice: String(li.unitPrice ?? 0),
          vatRate: String(li.vatRate ?? 5),
          amount: String(li.amount ?? 0),
          vatAmount: String(li.vatAmount ?? 0),
          lineNumber: li.lineNumber ?? index + 1,
        }),
      );
      await this.creditNoteLineItemsRepository.save(lineEntities);
    } else {
      if (dto.amount !== undefined) {
        creditNote.amount = dto.amount.toString();
      }
      if (dto.vatAmount !== undefined) {
        creditNote.vatAmount = dto.vatAmount.toString();
      }
    }
    if (dto.description !== undefined) {
      creditNote.description = dto.description;
    }
    if (dto.notes !== undefined) {
      creditNote.notes = dto.notes;
    }
    if (dto.customerId !== undefined) {
      if (dto.customerId) {
        // Customer entity would need to be imported
        creditNote.customer = { id: dto.customerId } as any;
      } else {
        creditNote.customer = null;
        creditNote.customerName = dto.customerName;
        creditNote.customerTrn = dto.customerTrn;
      }
    }

    const updated = await this.creditNotesRepository.save(creditNote);

    // If credit note is linked to an invoice, update the invoice's payment status
    if (updated.invoice?.id) {
      await this.salesInvoicesService.updatePaymentStatus(
        updated.invoice.id,
        organizationId,
      );
    }

    // Audit log
    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'CreditNote',
      entityId: creditNoteId,
      action: AuditAction.UPDATE,
      changes: dto,
    });

    return this.findById(organizationId, updated.id);
  }

  /**
   * Update credit note status
   */
  async updateStatus(
    organizationId: string,
    creditNoteId: string,
    userId: string,
    status: CreditNoteStatus,
  ): Promise<CreditNote> {
    const creditNote = await this.findById(organizationId, creditNoteId);

    // Validate status transition
    if (
      creditNote.status === CreditNoteStatus.APPLIED &&
      status !== CreditNoteStatus.APPLIED
    ) {
      throw new BadRequestException(
        'Cannot change status of applied credit note',
      );
    }

    if (
      creditNote.status === CreditNoteStatus.CANCELLED &&
      status !== CreditNoteStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Cannot change status of cancelled credit note',
      );
    }

    if (status === CreditNoteStatus.APPLIED && !creditNote.appliedToInvoice) {
      throw new BadRequestException(
        'Cannot set status to APPLIED unless credit note is applied to invoice',
      );
    }

    creditNote.status = status;
    const updated = await this.creditNotesRepository.save(creditNote);

    // If credit note is linked to an invoice, update the invoice's payment status
    if (updated.invoice?.id) {
      await this.salesInvoicesService.updatePaymentStatus(
        updated.invoice.id,
        organizationId,
      );
    }

    // Audit log
    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'CreditNote',
      entityId: creditNoteId,
      action: AuditAction.UPDATE,
      changes: { status: { from: creditNote.status, to: status } },
    });

    return this.findById(organizationId, updated.id);
  }

  /**
   * Delete credit note (soft delete)
   */
  async delete(
    organizationId: string,
    creditNoteId: string,
    userId: string,
  ): Promise<void> {
    const creditNote = await this.findById(organizationId, creditNoteId);

    if (creditNote.status === CreditNoteStatus.APPLIED) {
      throw new BadRequestException('Cannot delete applied credit note');
    }

    // Store invoice ID before soft delete
    const invoiceId = creditNote.invoice?.id;

    // Soft delete
    creditNote.isDeleted = true;
    await this.creditNotesRepository.save(creditNote);

    // If credit note was linked to an invoice, update the invoice's payment status
    if (invoiceId) {
      await this.salesInvoicesService.updatePaymentStatus(
        invoiceId,
        organizationId,
      );
    }

    // Audit log
    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'CreditNote',
      entityId: creditNoteId,
      action: AuditAction.DELETE,
      changes: { creditNoteNumber: creditNote.creditNoteNumber },
    });
  }
}
