import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerAccountsService } from './ledger-accounts.service';
import { LedgerAccountsController } from './ledger-accounts.controller';
import { LedgerAccount } from '../../entities/ledger-account.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LedgerAccount, Organization, User])],
  providers: [LedgerAccountsService],
  controllers: [LedgerAccountsController],
  exports: [LedgerAccountsService],
})
export class LedgerAccountsModule {}
