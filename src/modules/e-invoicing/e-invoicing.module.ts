import { Module } from '@nestjs/common';
import { E_INVOICING_PROVIDER } from './e-invoicing-provider.interface';
import { ManualExportEInvoicingProvider } from './manual-export-e-invoicing.provider';
import { EInvoicingService } from './e-invoicing.service';

@Module({
  providers: [
    ManualExportEInvoicingProvider,
    {
      // Swap this binding for a real ASP-backed provider once one is
      // integrated — nothing else in the app needs to change.
      provide: E_INVOICING_PROVIDER,
      useExisting: ManualExportEInvoicingProvider,
    },
    EInvoicingService,
  ],
  exports: [EInvoicingService],
})
export class EInvoicingModule {}
