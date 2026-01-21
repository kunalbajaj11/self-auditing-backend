import { PartialType } from '@nestjs/mapped-types';
import { CreateLedgerAccountDto } from './create-ledger-account.dto';

export class UpdateLedgerAccountDto extends PartialType(
  CreateLedgerAccountDto,
) {}
