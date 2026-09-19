import { Inject, Injectable } from '@nestjs/common';
import {
  E_INVOICING_PROVIDER,
  EInvoicingProvider,
  EInvoiceSubmissionResult,
} from './e-invoicing-provider.interface';

/**
 * Single entry point the rest of the app calls to submit a document through
 * the UAE e-invoicing network, and to compute the FTA's 14-day adjustment
 * reporting deadline. Delegates actual transmission to whichever
 * EInvoicingProvider is bound (see EInvoicingModule) — today that's the
 * no-op ManualExportEInvoicingProvider, until a real ASP is integrated.
 */
@Injectable()
export class EInvoicingService {
  constructor(
    @Inject(E_INVOICING_PROVIDER)
    private readonly provider: EInvoicingProvider,
  ) {}

  submitInvoice(
    organizationId: string,
    invoiceId: string,
    invoiceNumber: string,
  ): Promise<EInvoiceSubmissionResult> {
    return this.provider.submit({
      organizationId,
      documentType: 'invoice',
      documentId: invoiceId,
      documentNumber: invoiceNumber,
    });
  }

  submitCreditNote(
    organizationId: string,
    creditNoteId: string,
    creditNoteNumber: string,
  ): Promise<EInvoiceSubmissionResult> {
    return this.provider.submit({
      organizationId,
      documentType: 'credit_note',
      documentId: creditNoteId,
      documentNumber: creditNoteNumber,
    });
  }

  submitDebitNote(
    organizationId: string,
    debitNoteId: string,
    debitNoteNumber: string,
  ): Promise<EInvoiceSubmissionResult> {
    return this.provider.submit({
      organizationId,
      documentType: 'debit_note',
      documentId: debitNoteId,
      documentNumber: debitNoteNumber,
    });
  }

  /** UAE e-invoicing requires adjustment documents (credit/debit notes) to
   * be reported to the FTA within 14 days of the adjustment date. */
  computeReportingDueDate(documentDate: string | Date): Date {
    const base =
      typeof documentDate === 'string' ? new Date(documentDate) : documentDate;
    const due = new Date(base);
    due.setDate(due.getDate() + 14);
    return due;
  }
}
