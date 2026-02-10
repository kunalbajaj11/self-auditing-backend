export enum InvoiceStatus {
  PROFORMA_INVOICE = 'proforma_invoice',
  QUOTATION = 'quotation',
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
