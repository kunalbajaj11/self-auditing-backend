import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreditNote } from '../../entities/credit-note.entity';
import { CreditNoteApplication } from '../../entities/credit-note-application.entity';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { CreditNoteStatus } from '../../common/enums/credit-note-status.enum';
import { PaymentStatus } from '../../common/enums/payment-status.enum';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { SalesInvoicesService } from '../sales-invoices/sales-invoices.service';

@Injectable()
export class CreditNotesService {
  constructor(
    @InjectRepository(CreditNote)
    private readonly creditNotesRepository: Repository<CreditNote>,
    @InjectRepository(CreditNoteApplication)
    private readonly creditNoteApplicationsRepository: Repository<CreditNoteApplication>,
    @InjectRepository(SalesInvoice)
    private readonly invoicesRepository: Repository<SalesInvoice>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly salesInvoicesService: SalesInvoicesService,
  ) {}

  async findAll(organizationId: string): Promise<CreditNote[]> {
    return this.creditNotesRepository.find({
      where: { organization: { id: organizationId }, isDeleted: false },
      relations: ['customer', 'invoice'],
      order: { creditNoteDate: 'DESC' },
    });
  }

  async findById(
    organizationId: string,
    id: string,
  ): Promise<CreditNote> {
    const creditNote = await this.creditNotesRepository.findOne({
      where: { id, organization: { id: organizationId }, isDeleted: false },
      relations: ['customer', 'invoice', 'applications'],
    });
    if (!creditNote) {
      throw new NotFoundException('Credit note not found');
    }
    return creditNote;
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

    // Generate credit note number
    const year = new Date().getFullYear();
    const creditNoteNumber = await this.generateCreditNoteNumber(
      organizationId,
      year,
    );

    const creditNote = this.creditNotesRepository.create({
      organization,
      user,
      creditNoteNumber,
      creditNoteDate: dto.creditNoteDate,
      reason: dto.reason,
      amount: dto.amount.toString(),
      vatAmount: (dto.vatAmount || 0).toString(),
      currency: dto.currency || 'AED',
      description: dto.description,
      notes: dto.notes,
      status: CreditNoteStatus.DRAFT,
      customer: dto.customerId
        ? { id: dto.customerId }
        : undefined,
      customerName: dto.customerName,
      customerTrn: dto.customerTrn,
      invoice: dto.invoiceId ? { id: dto.invoiceId } : undefined,
    });

    return this.creditNotesRepository.save(creditNote);
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

    if (appliedAmount > outstandingBalance) {
      throw new BadRequestException(
        `Applied amount (${appliedAmount}) exceeds outstanding balance (${outstandingBalance})`,
      );
    }

    // Check if credit note has enough remaining amount
    const totalApplied = await this.getTotalAppliedAmount(creditNoteId);
    const remainingAmount =
      parseFloat(creditNote.totalAmount) - totalApplied;

    if (appliedAmount > remainingAmount) {
      throw new BadRequestException(
        `Applied amount exceeds remaining credit note amount`,
      );
    }

    // Create credit note application (DO NOT modify paidAmount)
    const application = this.creditNoteApplicationsRepository.create({
      creditNote,
      invoice,
      organization: { id: organizationId },
      appliedAmount: appliedAmount.toString(),
      appliedDate: new Date().toISOString().split('T')[0],
    });

    await this.creditNoteApplicationsRepository.save(application);

    // Update credit note status if fully applied
    const newTotalApplied = totalApplied + appliedAmount;
    if (newTotalApplied >= parseFloat(creditNote.totalAmount)) {
      creditNote.status = CreditNoteStatus.APPLIED;
      creditNote.appliedToInvoice = true;
      creditNote.appliedAmount = creditNote.totalAmount;
    } else {
      creditNote.appliedToInvoice = true;
      creditNote.appliedAmount = newTotalApplied.toString();
    }
    await this.creditNotesRepository.save(creditNote);

    // Recalculate invoice payment status (this uses calculateOutstandingBalance)
    await this.salesInvoicesService.updatePaymentStatus(
      invoiceId,
      organizationId,
    );

    return application;
  }

  private async getTotalAppliedAmount(creditNoteId: string): Promise<number> {
    const applications = await this.creditNoteApplicationsRepository.find({
      where: { creditNote: { id: creditNoteId } },
    });
    return applications.reduce(
      (sum, app) => sum + parseFloat(app.appliedAmount),
      0,
    );
  }

  private async generateCreditNoteNumber(
    organizationId: string,
    year: number,
  ): Promise<string> {
    // Implementation for generating credit note numbers
    // Similar to invoice number generation
    return `CN-${year}-${Date.now()}`;
  }
}

