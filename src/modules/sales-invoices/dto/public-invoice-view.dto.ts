import { PaymentStatus } from '../../../common/enums/payment-status.enum';

/**
 * Explicit field allowlist for the unauthenticated public invoice link
 * (GET /sales-invoices/public/:token). This endpoint has no auth guard by
 * design, so it must never return the raw SalesInvoice entity — that would
 * also expose the related Organization (bank IBAN/SWIFT, plan/billing
 * internals) and Customer (internal notes) to anyone holding the URL, none
 * of which the public invoice page displays.
 */
export interface PublicInvoiceLineItemView {
  itemName: string;
  description: string | null;
  quantity: string;
  unitOfMeasure: string | null;
  unitPrice: string;
  vatRate: string;
  amount: string;
  vatAmount: string;
  totalAmount: string;
}

export interface PublicInvoiceCustomerView {
  name: string;
  customerNumber: string | null;
  customerTrn: string | null;
}

export interface PublicInvoiceViewDto {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  paymentStatus: PaymentStatus;
  currency: string;
  amount: string;
  vatAmount: string;
  totalAmount: string;
  paidAmount: string;
  description: string | null;
  notes: string | null;
  customerName: string | null;
  customerTrn: string | null;
  customer: PublicInvoiceCustomerView | null;
  lineItems: PublicInvoiceLineItemView[];
}
