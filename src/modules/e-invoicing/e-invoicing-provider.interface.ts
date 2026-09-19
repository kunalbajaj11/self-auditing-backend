export type EInvoiceDocumentType = 'invoice' | 'credit_note' | 'debit_note';

export interface EInvoiceDocument {
  organizationId: string;
  documentType: EInvoiceDocumentType;
  documentId: string;
  documentNumber: string;
}

export type EInvoiceSubmissionStatus = 'submitted' | 'not_configured' | 'failed';

export interface EInvoiceSubmissionResult {
  status: EInvoiceSubmissionStatus;
  message: string;
  submittedAt?: Date;
  /** Whatever reference/receipt ID the ASP returns for this submission. */
  providerReference?: string;
}

/**
 * Contract for whatever actually transmits an invoice/credit note/debit note
 * through the UAE e-invoicing network (Peppol 5-corner model, via an
 * Accredited Service Provider). Every place in the app that needs to submit
 * a document depends on this interface, not on a specific ASP's SDK — so
 * picking and wiring up a real ASP later is a matter of implementing this
 * interface and rebinding it in EInvoicingModule, not rewriting every call
 * site.
 */
export interface EInvoicingProvider {
  readonly providerName: string;
  submit(document: EInvoiceDocument): Promise<EInvoiceSubmissionResult>;
}

export const E_INVOICING_PROVIDER = Symbol('E_INVOICING_PROVIDER');
