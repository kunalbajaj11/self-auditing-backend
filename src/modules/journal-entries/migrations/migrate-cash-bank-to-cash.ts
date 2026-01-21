/**
 * Migration Script: Convert cash_bank entries to cash
 *
 * This script migrates existing journal entries from:
 * - debit_account = 'cash_bank' → 'cash'
 * - credit_account = 'cash_bank' → 'cash'
 *
 * All cash_bank entries are mapped to cash (not bank) as per client requirement.
 */

import { DataSource } from 'typeorm';
import { JournalEntry } from '../../../entities/journal-entry.entity';

export async function migrateCashBankToCash(
  dataSource: DataSource,
): Promise<void> {
  const journalEntryRepository = dataSource.getRepository(JournalEntry);

  // Update debit_account from cash_bank to cash
  const debitResult = await journalEntryRepository
    .createQueryBuilder()
    .update(JournalEntry)
    .set({ debitAccount: 'cash' as any })
    .where("debit_account = 'cash_bank'")
    .execute();

  console.log(
    `Updated ${debitResult.affected || 0} entries with debit_account = 'cash_bank' → 'cash'`,
  );

  // Update credit_account from cash_bank to cash
  const creditResult = await journalEntryRepository
    .createQueryBuilder()
    .update(JournalEntry)
    .set({ creditAccount: 'cash' as any })
    .where("credit_account = 'cash_bank'")
    .execute();

  console.log(
    `Updated ${creditResult.affected || 0} entries with credit_account = 'cash_bank' → 'cash'`,
  );

  console.log(`\nMigration complete:`);
  console.log(
    `- Total entries updated: ${(debitResult.affected || 0) + (creditResult.affected || 0)}`,
  );
}
