export enum InvoiceStatus {
  PROFORMA_INVOICE = 'proforma_invoice',
  QUOTATION = 'quotation',
  /** Quotation that was converted to a proforma invoice; kept in list for tracking */
  QUOTATION_CONVERTED_TO_PROFORMA = 'quotation_converted_to_proforma',
  /** Proforma that was converted to a tax invoice; kept in list for tracking */
  PROFORMA_CONVERTED_TO_INVOICE = 'proforma_converted_to_invoice',
  TAX_INVOICE_RECEIVABLE = 'tax_invoice_receivable',
  TAX_INVOICE_BANK_RECEIVED = 'tax_invoice_bank_received',
  TAX_INVOICE_CASH_RECEIVED = 'tax_invoice_cash_received',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
  // Legacy statuses - kept for backward compatibility with existing data
  DRAFT = 'draft',
  SENT = 'sent',
  PAID = 'paid',
}
