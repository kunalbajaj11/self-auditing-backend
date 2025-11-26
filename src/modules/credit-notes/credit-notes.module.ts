import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditNotesService } from './credit-notes.service';
import { CreditNotesController } from './credit-notes.controller';
import { CreditNote } from '../../entities/credit-note.entity';
import { CreditNoteApplication } from '../../entities/credit-note-application.entity';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { SalesInvoicesModule } from '../sales-invoices/sales-invoices.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreditNote,
      CreditNoteApplication,
      SalesInvoice,
      Organization,
      User,
    ]),
    forwardRef(() => SalesInvoicesModule),
  ],
  providers: [CreditNotesService],
  controllers: [CreditNotesController],
  exports: [CreditNotesService],
})
export class CreditNotesModule {}

