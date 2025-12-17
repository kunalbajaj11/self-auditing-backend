import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DebitNotesService } from './debit-notes.service';
import { DebitNotesController } from './debit-notes.controller';
import { DebitNote } from '../../entities/debit-note.entity';
import { DebitNoteApplication } from '../../entities/debit-note-application.entity';
import { SettingsModule } from '../settings/settings.module';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { SalesInvoicesModule } from '../sales-invoices/sales-invoices.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DebitNote,
      DebitNoteApplication,
      SalesInvoice,
      Organization,
      User,
    ]),
    forwardRef(() => SalesInvoicesModule),
    AuditLogsModule,
    SettingsModule,
  ],
  providers: [DebitNotesService],
  controllers: [DebitNotesController],
  exports: [DebitNotesService],
})
export class DebitNotesModule {}

