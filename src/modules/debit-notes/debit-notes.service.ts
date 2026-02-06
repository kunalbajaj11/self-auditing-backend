import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DebitNote } from '../../entities/debit-note.entity';
import { DebitNoteApplication } from '../../entities/debit-note-application.entity';
import { DebitNoteExpenseApplication } from '../../entities/debit-note-expense-application.entity';
import { NumberingSequenceType } from '../../entities/numbering-sequence.entity';
import { SettingsService } from '../settings/settings.service';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { Expense } from '../../entities/expense.entity';
import { Vendor } from '../vendors/vendor.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { DebitNoteStatus } from '../../common/enums/debit-note-status.enum';
import { PaymentStatus } from '../../common/enums/payment-status.enum';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { SalesInvoicesService } from '../sales-invoices/sales-invoices.service';
import { ExpensesService } from '../expenses/expenses.service';
import { ExpensePaymentsService } from '../expense-payments/expense-payments.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class DebitNotesService {
  constructor(
    @InjectRepository(DebitNote)
    private readonly debitNotesRepository: Repository<DebitNote>,
    @InjectRepository(DebitNoteApplication)
    private readonly debitNoteApplicationsRepository: Repository<DebitNoteApplication>,
    @InjectRepository(DebitNoteExpenseApplication)
    private readonly debitNoteExpenseApplicationsRepository: Repository<DebitNoteExpenseApplication>,
    @InjectRepository(SalesInvoice)
    private readonly invoicesRepository: Repository<SalesInvoice>,
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly salesInvoicesService: SalesInvoicesService,
    private readonly expensesService: ExpensesService,
    private readonly expensePaymentsService: ExpensePaymentsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly settingsService: SettingsService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(organizationId: string): Promise<DebitNote[]> {
    return this.debitNotesRepository.find({
      where: { organization: { id: organizationId }, isDeleted: false },
      relations: ['customer', 'invoice', 'vendor', 'expense'],
      order: { debitNoteDate: 'DESC' },
    });
  }

  async findById(organizationId: string, id: string): Promise<DebitNote> {
    const debitNote = await this.debitNotesRepository.findOne({
      where: { id, organization: { id: organizationId }, isDeleted: false },
      relations: [
        'customer',
        'invoice',
        'vendor',
        'expense',
        'applications',
        'expenseApplications',
      ],
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

    // Validate: Debit note should be either for customer (invoice) OR supplier (expense), not both
    if (dto.invoiceId && dto.expenseId) {
      throw new BadRequestException(
        'Debit note cannot be linked to both invoice and expense',
      );
    }
    if (dto.customerId && dto.vendorId) {
      throw new BadRequestException(
        'Debit note cannot have both customer and vendor',
      );
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
      // Customer fields (for sales debit notes)
      customer: dto.customerId ? { id: dto.customerId } : undefined,
      customerName: dto.customerName,
      customerTrn: dto.customerTrn,
      invoice: dto.invoiceId ? { id: dto.invoiceId } : undefined,
      // Supplier fields (for expense debit notes)
      vendor: dto.vendorId ? { id: dto.vendorId } : undefined,
      vendorName: dto.vendorName,
      vendorTrn: dto.vendorTrn,
      expense: dto.expenseId ? { id: dto.expenseId } : undefined,
    });

    const saved = await this.debitNotesRepository.save(debitNote);

    // If debit note is linked to an invoice, update the invoice's payment status
    if (saved.invoice?.id) {
      await this.salesInvoicesService.updatePaymentStatus(
        saved.invoice.id,
        organizationId,
      );
    }

    return saved;
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

    // Validate: Only customer debit notes (linked to invoices) can be applied to invoices
    if (debitNote.expense?.id || debitNote.expense) {
      throw new BadRequestException(
        'Supplier debit notes cannot be applied to invoices. Use apply-to-expense endpoint instead.',
      );
    }

    if (debitNote.status !== DebitNoteStatus.ISSUED) {
      throw new BadRequestException(
        'Debit note must be issued before applying to invoice',
      );
    }

    // Check if debit note has enough remaining amount
    const totalApplied = await this.getTotalAppliedAmount(
      debitNoteId,
      organizationId,
    );
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

  /**
   * Apply debit note to expense
   * This method creates a DebitNoteExpenseApplication record
   * Outstanding balance = expense.total_amount - expensePayments - debitNoteExpenseApplications
   */
  async applyDebitNoteToExpense(
    organizationId: string,
    debitNoteId: string,
    expenseId: string,
    appliedAmount: number,
  ): Promise<DebitNoteExpenseApplication> {
    const debitNote = await this.findById(organizationId, debitNoteId);
    const expense = await this.expensesRepository.findOne({
      where: { id: expenseId, organization: { id: organizationId } },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    // Validate: Only supplier debit notes (linked to expenses) can be applied to expenses
    if (debitNote.invoice?.id || debitNote.invoice) {
      throw new BadRequestException(
        'Customer debit notes cannot be applied to expenses. Use apply endpoint for invoices instead.',
      );
    }

    if (debitNote.status !== DebitNoteStatus.ISSUED) {
      throw new BadRequestException(
        'Debit note must be issued before applying to expense',
      );
    }

    // Validate applied amount first
    const numericAppliedAmount = Number(appliedAmount);
    if (!Number.isFinite(numericAppliedAmount) || numericAppliedAmount <= 0) {
      throw new BadRequestException(
        'Applied amount must be a number greater than 0',
      );
    }

    // Use a small tolerance (0.01) for floating-point comparison
    const tolerance = 0.01;

    // Check if debit note has enough remaining amount
    // Pass organizationId to ensure we only count applications for this organization
    const totalApplied = await this.getTotalAppliedAmount(
      debitNoteId,
      organizationId,
    );
    const totalExpenseApplied = await this.getTotalExpenseAppliedAmount(
      debitNoteId,
      organizationId,
    );
    const debitNoteTotal = parseFloat(debitNote.totalAmount || '0');
    // Round to 2 decimal places to avoid floating-point precision issues
    const remainingAmount =
      Math.round((debitNoteTotal - totalApplied - totalExpenseApplied) * 100) /
      100;

    // Check if there's already an application for this specific expense
    // If so, we should update it rather than create a duplicate
    const existingApplication =
      await this.debitNoteExpenseApplicationsRepository.findOne({
        where: {
          debitNote: { id: debitNoteId },
          expense: { id: expenseId },
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
          `Applied amount (${numericAppliedAmount.toFixed(2)}) exceeds remaining debit note amount (${remainingIncludingExisting.toFixed(2)}). There is already an application of ${existingApplied.toFixed(2)} to this expense.`,
        );
      }

      // Update existing application instead of creating a new one
      existingApplication.appliedAmount = numericAppliedAmount.toString();
      existingApplication.appliedDate = new Date().toISOString().split('T')[0];
      await this.debitNoteExpenseApplicationsRepository.save(
        existingApplication,
      );

      // Recalculate total applied (excluding the old amount, including the new)
      const newTotalExpenseApplied =
        totalExpenseApplied - existingApplied + numericAppliedAmount;
      const newTotalApplied = totalApplied + newTotalExpenseApplied;
      const fullyApplied = newTotalApplied >= debitNoteTotal;

      await this.debitNotesRepository.update(debitNote.id, {
        status: fullyApplied ? DebitNoteStatus.APPLIED : debitNote.status,
        appliedToExpense: true,
        appliedAmount: fullyApplied
          ? debitNote.totalAmount
          : newTotalApplied.toString(),
      });

      return existingApplication;
    }

    // If remaining amount is 0 or negative and no existing application, throw error
    if (remainingAmount <= 0) {
      throw new BadRequestException(
        `Debit note has no remaining amount. Total: ${debitNoteTotal.toFixed(2)}, Already Applied: ${(totalApplied + totalExpenseApplied).toFixed(2)}.`,
      );
    }

    if (numericAppliedAmount > remainingAmount + tolerance) {
      throw new BadRequestException(
        `Applied amount (${numericAppliedAmount.toFixed(2)}) exceeds remaining debit note amount (${remainingAmount.toFixed(2)})`,
      );
    }

    // Calculate outstanding balance for expense
    const expensePayments = await this.expensePaymentsService.findByExpense(
      organizationId,
      expenseId,
    );
    const totalPaid = expensePayments.reduce(
      (sum, p) => sum + parseFloat(p.amount),
      0,
    );

    // Get existing debit note applications for this expense (excluding the one we're about to create/update)
    const existingApplications =
      await this.debitNoteExpenseApplicationsRepository.find({
        where: {
          expense: { id: expenseId },
          organization: { id: organizationId },
          isDeleted: false,
        },
      });
    const totalDebitNoteApplied = existingApplications.reduce(
      (sum, app) => sum + parseFloat(app.appliedAmount || '0'),
      0,
    );

    const outstandingBalance =
      parseFloat(expense.totalAmount) - totalPaid - totalDebitNoteApplied;

    if (numericAppliedAmount > outstandingBalance + tolerance) {
      throw new BadRequestException(
        `Applied amount (${numericAppliedAmount.toFixed(2)}) exceeds outstanding balance (${outstandingBalance.toFixed(2)})`,
      );
    }

    // Create debit note expense application
    const application = this.debitNoteExpenseApplicationsRepository.create({
      debitNote,
      expense,
      organization: { id: organizationId },
      appliedAmount: numericAppliedAmount.toString(),
      appliedDate: new Date().toISOString().split('T')[0],
    });

    await this.debitNoteExpenseApplicationsRepository.save(application);

    // Update debit note status if fully applied.
    // Use a direct update to avoid accidentally touching relations (like existing
    // debit_note_expense_applications) which can cause FK issues.
    const newTotalExpenseApplied = totalExpenseApplied + numericAppliedAmount;
    const newTotalApplied = totalApplied + newTotalExpenseApplied;
    const fullyApplied = newTotalApplied >= debitNoteTotal;

    await this.debitNotesRepository.update(debitNote.id, {
      status: fullyApplied ? DebitNoteStatus.APPLIED : debitNote.status,
      appliedToExpense: true,
      appliedAmount: fullyApplied
        ? debitNote.totalAmount
        : newTotalApplied.toString(),
    });

    return application;
  }

  private async getTotalAppliedAmount(
    debitNoteId: string,
    organizationId?: string,
  ): Promise<number> {
    const whereClause: any = {
      debitNote: { id: debitNoteId },
      isDeleted: false,
    };
    if (organizationId) {
      whereClause.organization = { id: organizationId };
    }

    const applications = await this.debitNoteApplicationsRepository.find({
      where: whereClause,
    });
    const total = applications.reduce(
      (sum, app) => sum + parseFloat(app.appliedAmount || '0'),
      0,
    );
    // Round to 2 decimal places to avoid floating-point precision issues
    return Math.round(total * 100) / 100;
  }

  private async getTotalExpenseAppliedAmount(
    debitNoteId: string,
    organizationId?: string,
  ): Promise<number> {
    const whereClause: any = {
      debitNote: { id: debitNoteId },
      isDeleted: false,
    };
    if (organizationId) {
      whereClause.organization = { id: organizationId };
    }

    const applications = await this.debitNoteExpenseApplicationsRepository.find(
      {
        where: whereClause,
      },
    );
    const total = applications.reduce(
      (sum, app) => sum + parseFloat(app.appliedAmount || '0'),
      0,
    );
    // Round to 2 decimal places to avoid floating-point precision issues
    return Math.round(total * 100) / 100;
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

    // Validate: Debit note should be either for customer (invoice) OR supplier (expense), not both
    const newInvoiceId =
      dto.invoiceId !== undefined ? dto.invoiceId : debitNote.invoice?.id;
    const newExpenseId =
      dto.expenseId !== undefined ? dto.expenseId : debitNote.expense?.id;
    if (newInvoiceId && newExpenseId) {
      throw new BadRequestException(
        'Debit note cannot be linked to both invoice and expense',
      );
    }
    const newCustomerId =
      dto.customerId !== undefined ? dto.customerId : debitNote.customer?.id;
    const newVendorId =
      dto.vendorId !== undefined ? dto.vendorId : debitNote.vendor?.id;
    if (newCustomerId && newVendorId) {
      throw new BadRequestException(
        'Debit note cannot have both customer and vendor',
      );
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
    if (dto.vendorId !== undefined) {
      if (dto.vendorId) {
        debitNote.vendor = { id: dto.vendorId } as any;
      } else {
        debitNote.vendor = null;
        debitNote.vendorName = dto.vendorName;
        debitNote.vendorTrn = dto.vendorTrn;
      }
    }
    if (dto.expenseId !== undefined) {
      debitNote.expense = dto.expenseId ? ({ id: dto.expenseId } as any) : null;
    }
    if (dto.invoiceId !== undefined) {
      debitNote.invoice = dto.invoiceId ? ({ id: dto.invoiceId } as any) : null;
    }

    const updated = await this.debitNotesRepository.save(debitNote);

    // If debit note is linked to an invoice, update the invoice's payment status
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

    if (
      status === DebitNoteStatus.APPLIED &&
      !debitNote.appliedToInvoice &&
      !debitNote.appliedToExpense
    ) {
      throw new BadRequestException(
        'Cannot set status to APPLIED unless debit note is applied to invoice or expense',
      );
    }

    debitNote.status = status;
    const updated = await this.debitNotesRepository.save(debitNote);

    // If debit note is linked to an invoice, update the invoice's payment status
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

    // Store invoice ID before soft delete
    const invoiceId = debitNote.invoice?.id;

    // Soft delete
    debitNote.isDeleted = true;
    await this.debitNotesRepository.save(debitNote);

    // If debit note was linked to an invoice, update the invoice's payment status
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
      entityType: 'DebitNote',
      entityId: debitNoteId,
      action: AuditAction.DELETE,
      changes: { debitNoteNumber: debitNote.debitNoteNumber },
    });
  }
}
