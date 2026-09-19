import { Injectable, Logger } from '@nestjs/common';
import {
  EInvoiceDocument,
  EInvoicingProvider,
  EInvoiceSubmissionResult,
} from './e-invoicing-provider.interface';

/**
 * Default e-invoicing provider until an accredited service provider (ASP)
 * is actually contracted and integrated. It does not transmit anything to
 * the Peppol network or the FTA — it exists so every document lifecycle
 * event in the app has one consistent place to call, instead of scattering
 * "wire this up once we have an ASP" comments through the codebase.
 *
 * Swap this out for a real ASP-backed implementation once one is selected
 * (see EInvoicingModule) — everything upstream already depends on
 * EInvoicingProvider, so that swap is a binding change here, not a
 * call-site rewrite.
 */
@Injectable()
export class ManualExportEInvoicingProvider implements EInvoicingProvider {
  readonly providerName = 'manual-export (no ASP configured)';
  private readonly logger = new Logger(ManualExportEInvoicingProvider.name);

  async submit(document: EInvoiceDocument): Promise<EInvoiceSubmissionResult> {
    this.logger.warn(
      `E-invoicing submission requested for ${document.documentType} ` +
        `${document.documentNumber} (org ${document.organizationId}) but no ` +
        `ASP is configured — this document has NOT been transmitted and this ` +
        `organization must not be treated as e-invoicing compliant.`,
    );
    return {
      status: 'not_configured',
      message:
        'No accredited service provider is configured yet. This document ' +
        'must be exported and submitted manually until ASP integration is complete.',
    };
  }
}
