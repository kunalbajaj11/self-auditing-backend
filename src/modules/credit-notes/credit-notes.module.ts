import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditNotesService } from './credit-notes.service';
import { CreditNotesController } from './credit-notes.controller';
import { CreditNote } from '../../entities/credit-note.entity';
import { CreditNoteApplication } from '../../entities/credit-note-application.entity';
import { CreditNoteNumberSequence } from '../../entities/credit-note-number-sequence.entity';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { SalesInvoicesModule } from '../sales-invoices/sales-invoices.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreditNote,
      CreditNoteApplication,
      CreditNoteNumberSequence,
      SalesInvoice,
      Organization,
      User,
    ]),
    forwardRef(() => SalesInvoicesModule),
    AuditLogsModule,
  ],
  providers: [CreditNotesService],
  controllers: [CreditNotesController],
  exports: [CreditNotesService],
})
export class CreditNotesModule {}
