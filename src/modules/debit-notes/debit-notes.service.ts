import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DebitNote } from '../../entities/debit-note.entity';
import { DebitNoteApplication } from '../../entities/debit-note-application.entity';
import { NumberingSequenceType } from '../../entities/numbering-sequence.entity';
import { SettingsService } from '../settings/settings.service';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { DebitNoteStatus } from '../../common/enums/debit-note-status.enum';
import { PaymentStatus } from '../../common/enums/payment-status.enum';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { SalesInvoicesService } from '../sales-invoices/sales-invoices.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class DebitNotesService {
  constructor(
    @InjectRepository(DebitNote)
    private readonly debitNotesRepository: Repository<DebitNote>,
    @InjectRepository(DebitNoteApplication)
    private readonly debitNoteApplicationsRepository: Repository<DebitNoteApplication>,
    @InjectRepository(SalesInvoice)
    private readonly invoicesRepository: Repository<SalesInvoice>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly salesInvoicesService: SalesInvoicesService,
    private readonly auditLogsService: AuditLogsService,
    private readonly settingsService: SettingsService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(organizationId: string): Promise<DebitNote[]> {
    return this.debitNotesRepository.find({
      where: { organization: { id: organizationId }, isDeleted: false },
      relations: ['customer', 'invoice'],
      order: { debitNoteDate: 'DESC' },
    });
  }

  async findById(organizationId: string, id: string): Promise<DebitNote> {
    const debitNote = await this.debitNotesRepository.findOne({
      where: { id, organization: { id: organizationId }, isDeleted: false },
      relations: ['customer', 'invoice', 'applications'],
    });
    if (!debitNote) {
      throw new NotFoundException('Debit note not found');
    }
    return debitNote;
  }

  async create(
    organizationId: string,
    userId: string,
    dto: any, // CreateDebitNoteDto
  ): Promise<DebitNote> {
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

    // Generate debit note number using centralized numbering sequence
    const debitNoteNumber = await this.settingsService.generateNextNumber(
      organizationId,
      NumberingSequenceType.DEBIT_NOTE,
    );

    const debitNote = this.debitNotesRepository.create({
      organization,
      user,
      debitNoteNumber,
      debitNoteDate: dto.debitNoteDate,
      reason: dto.reason,
      amount: dto.amount.toString(),
      vatAmount: (dto.vatAmount || 0).toString(),
      currency: dto.currency || 'AED',
      description: dto.description,
      notes: dto.notes,
      status: DebitNoteStatus.DRAFT,
      customer: dto.customerId ? { id: dto.customerId } : undefined,
      customerName: dto.customerName,
      customerTrn: dto.customerTrn,
      invoice: dto.invoiceId ? { id: dto.invoiceId } : undefined,
    });

    return this.debitNotesRepository.save(debitNote);
  }

  /**
   * Apply debit note to invoice
   * This method creates a DebitNoteApplication record
   * Outstanding balance = totalAmount - paidAmount + appliedDebitNoteAmount
   */
  async applyDebitNoteToInvoice(
    organizationId: string,
    debitNoteId: string,
    invoiceId: string,
    appliedAmount: number,
  ): Promise<DebitNoteApplication> {
    const debitNote = await this.findById(organizationId, debitNoteId);
    const invoice = await this.invoicesRepository.findOne({
      where: { id: invoiceId, organization: { id: organizationId } },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (debitNote.status !== DebitNoteStatus.ISSUED) {
      throw new BadRequestException(
        'Debit note must be issued before applying to invoice',
      );
    }

    // Check if debit note has enough remaining amount
    const totalApplied = await this.getTotalAppliedAmount(debitNoteId);
    const remainingAmount = parseFloat(debitNote.totalAmount) - totalApplied;

    if (appliedAmount > remainingAmount) {
      throw new BadRequestException(
        `Applied amount exceeds remaining debit note amount`,
      );
    }

    // Create debit note application
    const application = this.debitNoteApplicationsRepository.create({
      debitNote,
      invoice,
      organization: { id: organizationId },
      appliedAmount: appliedAmount.toString(),
      appliedDate: new Date().toISOString().split('T')[0],
    });

    await this.debitNoteApplicationsRepository.save(application);

    // Update debit note status if fully applied
    const newTotalApplied = totalApplied + appliedAmount;
    if (newTotalApplied >= parseFloat(debitNote.totalAmount)) {
      debitNote.status = DebitNoteStatus.APPLIED;
      debitNote.appliedToInvoice = true;
      debitNote.appliedAmount = debitNote.totalAmount;
    } else {
      debitNote.appliedToInvoice = true;
      debitNote.appliedAmount = newTotalApplied.toString();
    }
    await this.debitNotesRepository.save(debitNote);

    // Recalculate invoice payment status
    await this.salesInvoicesService.updatePaymentStatus(
      invoiceId,
      organizationId,
    );

    return application;
  }

  private async getTotalAppliedAmount(debitNoteId: string): Promise<number> {
    const applications = await this.debitNoteApplicationsRepository.find({
      where: { debitNote: { id: debitNoteId } },
    });
    return applications.reduce(
      (sum, app) => sum + parseFloat(app.appliedAmount),
      0,
    );
  }

  /**
   * Get next debit note number without creating a debit note
   * Useful for previewing the next number
   */
  async getNextDebitNoteNumber(organizationId: string): Promise<string> {
    return this.settingsService.getNextNumber(
      organizationId,
      NumberingSequenceType.DEBIT_NOTE,
    );
  }

  /**
   * Update debit note
   */
  async update(
    organizationId: string,
    debitNoteId: string,
    userId: string,
    dto: any, // UpdateDebitNoteDto
  ): Promise<DebitNote> {
    const debitNote = await this.findById(organizationId, debitNoteId);

    if (debitNote.status === DebitNoteStatus.APPLIED) {
      throw new BadRequestException('Cannot update applied debit note');
    }

    if (debitNote.status === DebitNoteStatus.CANCELLED) {
      throw new BadRequestException('Cannot update cancelled debit note');
    }

    // Update allowed fields
    if (dto.debitNoteDate !== undefined) {
      debitNote.debitNoteDate = dto.debitNoteDate;
    }
    if (dto.reason !== undefined) {
      debitNote.reason = dto.reason;
    }
    if (dto.amount !== undefined) {
      debitNote.amount = dto.amount.toString();
    }
    if (dto.vatAmount !== undefined) {
      debitNote.vatAmount = dto.vatAmount.toString();
    }
    if (dto.description !== undefined) {
      debitNote.description = dto.description;
    }
    if (dto.notes !== undefined) {
      debitNote.notes = dto.notes;
    }
    if (dto.customerId !== undefined) {
      if (dto.customerId) {
        debitNote.customer = { id: dto.customerId } as any;
      } else {
        debitNote.customer = null;
        debitNote.customerName = dto.customerName;
        debitNote.customerTrn = dto.customerTrn;
      }
    }

    const updated = await this.debitNotesRepository.save(debitNote);

    // Audit log
    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'DebitNote',
      entityId: debitNoteId,
      action: AuditAction.UPDATE,
      changes: dto,
    });

    return this.findById(organizationId, updated.id);
  }

  /**
   * Update debit note status
   */
  async updateStatus(
    organizationId: string,
    debitNoteId: string,
    userId: string,
    status: DebitNoteStatus,
  ): Promise<DebitNote> {
    const debitNote = await this.findById(organizationId, debitNoteId);

    // Validate status transition
    if (
      debitNote.status === DebitNoteStatus.APPLIED &&
      status !== DebitNoteStatus.APPLIED
    ) {
      throw new BadRequestException(
        'Cannot change status of applied debit note',
      );
    }

    if (
      debitNote.status === DebitNoteStatus.CANCELLED &&
      status !== DebitNoteStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Cannot change status of cancelled debit note',
      );
    }

    if (status === DebitNoteStatus.APPLIED && !debitNote.appliedToInvoice) {
      throw new BadRequestException(
        'Cannot set status to APPLIED unless debit note is applied to invoice',
      );
    }

    debitNote.status = status;
    const updated = await this.debitNotesRepository.save(debitNote);

    // Audit log
    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'DebitNote',
      entityId: debitNoteId,
      action: AuditAction.UPDATE,
      changes: { status: { from: debitNote.status, to: status } },
    });

    return this.findById(organizationId, updated.id);
  }

  /**
   * Delete debit note (soft delete)
   */
  async delete(
    organizationId: string,
    debitNoteId: string,
    userId: string,
  ): Promise<void> {
    const debitNote = await this.findById(organizationId, debitNoteId);

    if (debitNote.status === DebitNoteStatus.APPLIED) {
      throw new BadRequestException('Cannot delete applied debit note');
    }

    // Soft delete
    debitNote.isDeleted = true;
    await this.debitNotesRepository.save(debitNote);

    // Audit log
    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'DebitNote',
      entityId: debitNoteId,
      action: AuditAction.DELETE,
      changes: { debitNoteNumber: debitNote.debitNoteNumber },
    });
  }
}
