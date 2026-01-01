/**
 * Migration Script: Convert old journal entry structure to new structure
 *
 * This script migrates existing journal entries from:
 * - type/category/status → debitAccount/creditAccount
 *
 * Migration Rules:
 * 1. Cash/Bank entries (status: cash_paid, bank_paid, cash_received, bank_received)
 *    - Debit: Cash/Bank (for received) or Credit: Cash/Bank (for paid)
 *    - Opposite side based on type/category
 *
 * 2. Equity entries (category: equity)
 *    - share_capital → Credit: Share Capital, Debit: Cash/Bank or other
 *    - retained_earnings → Credit: Retained Earnings, Debit: other
 *    - shareholder_account → Debit: Owner/Shareholder Account, Credit: Cash/Bank or other
 *
 * 3. Other entries
 *    - prepaid → Debit: Prepaid Expenses, Credit: Cash/Bank or Accounts Payable
 *    - accrued_income → Debit: Accrued Income, Credit: Sales Revenue
 *    - depreciation → Debit: General Expense, Credit: (needs manual review)
 *    - outstanding → Credit: Accounts Payable, Debit: Cash/Bank or other
 */

import { DataSource } from 'typeorm';
import { JournalEntry } from '../../../entities/journal-entry.entity';
import { JournalEntryAccount } from '../../../common/enums/journal-entry-account.enum';

export async function migrateJournalEntries(
  dataSource: DataSource,
): Promise<void> {
  const journalEntryRepository = dataSource.getRepository(JournalEntry);

  // Get all entries that haven't been migrated (still have legacy fields)
  const entries = await journalEntryRepository.find({
    where: {
      isDeleted: false,
    },
  });

  console.log(`Found ${entries.length} journal entries to migrate`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const entry of entries) {
    try {
      // Skip if already migrated (has debitAccount and creditAccount)
      if ((entry as any).debitAccount && (entry as any).creditAccount) {
        skipped++;
        continue;
      }

      // Get legacy fields
      const legacyType = (entry as any).type || (entry as any).legacyType;
      const legacyCategory =
        (entry as any).category || (entry as any).legacyCategory;
      const legacyStatus = (entry as any).status || (entry as any).legacyStatus;

      if (!legacyType || !legacyCategory || !legacyStatus) {
        console.warn(`Entry ${entry.id} missing legacy fields, skipping`);
        errors++;
        continue;
      }

      let debitAccount: JournalEntryAccount;
      let creditAccount: JournalEntryAccount;

      // Migration logic based on status (Cash/Bank entries)
      if (
        legacyStatus === 'cash_received' ||
        legacyStatus === 'bank_received'
      ) {
        // Cash/Bank received - debit Cash/Bank
        debitAccount = JournalEntryAccount.CASH_BANK;

        // Credit side based on type
        if (legacyType === 'share_capital') {
          creditAccount = JournalEntryAccount.SHARE_CAPITAL;
        } else if (legacyType === 'retained_earnings') {
          creditAccount = JournalEntryAccount.RETAINED_EARNINGS;
        } else {
          creditAccount = JournalEntryAccount.SALES_REVENUE; // Default
        }
      } else if (legacyStatus === 'cash_paid' || legacyStatus === 'bank_paid') {
        // Cash/Bank paid - credit Cash/Bank
        creditAccount = JournalEntryAccount.CASH_BANK;

        // Debit side based on type
        if (legacyType === 'shareholder_account') {
          debitAccount = JournalEntryAccount.OWNER_SHAREHOLDER_ACCOUNT;
        } else if (legacyType === 'outstanding') {
          debitAccount = JournalEntryAccount.ACCOUNTS_PAYABLE;
        } else {
          debitAccount = JournalEntryAccount.GENERAL_EXPENSE; // Default
        }
      } else {
        // Non-cash entries - based on type and category
        if (legacyCategory === 'equity') {
          if (legacyType === 'share_capital') {
            debitAccount = JournalEntryAccount.CASH_BANK;
            creditAccount = JournalEntryAccount.SHARE_CAPITAL;
          } else if (legacyType === 'retained_earnings') {
            debitAccount = JournalEntryAccount.GENERAL_EXPENSE; // Usually expenses
            creditAccount = JournalEntryAccount.RETAINED_EARNINGS;
          } else if (legacyType === 'shareholder_account') {
            debitAccount = JournalEntryAccount.OWNER_SHAREHOLDER_ACCOUNT;
            creditAccount = JournalEntryAccount.CASH_BANK;
          } else {
            debitAccount = JournalEntryAccount.GENERAL_EXPENSE;
            creditAccount = JournalEntryAccount.SHARE_CAPITAL;
          }
        } else {
          // Others category
          if (legacyType === 'prepaid') {
            debitAccount = JournalEntryAccount.PREPAID_EXPENSES;
            creditAccount = JournalEntryAccount.CASH_BANK;
          } else if (legacyType === 'accrued_income') {
            debitAccount = JournalEntryAccount.ACCOUNTS_RECEIVABLE;
            creditAccount = JournalEntryAccount.SALES_REVENUE;
          } else if (legacyType === 'depreciation') {
            debitAccount = JournalEntryAccount.GENERAL_EXPENSE;
            creditAccount = JournalEntryAccount.CASH_BANK; // May need manual review
          } else if (legacyType === 'outstanding') {
            debitAccount = JournalEntryAccount.GENERAL_EXPENSE;
            creditAccount = JournalEntryAccount.ACCOUNTS_PAYABLE;
          } else {
            debitAccount = JournalEntryAccount.GENERAL_EXPENSE;
            creditAccount = JournalEntryAccount.CASH_BANK;
          }
        }
      }

      // Update entry
      (entry as any).debitAccount = debitAccount;
      (entry as any).creditAccount = creditAccount;

      // Preserve legacy fields for reference
      (entry as any).legacyType = legacyType;
      (entry as any).legacyCategory = legacyCategory;
      (entry as any).legacyStatus = legacyStatus;

      await journalEntryRepository.save(entry);
      migrated++;

      if (migrated % 100 === 0) {
        console.log(`Migrated ${migrated} entries...`);
      }
    } catch (error) {
      console.error(`Error migrating entry ${entry.id}:`, error);
      errors++;
    }
  }

  console.log(`\nMigration complete:`);
  console.log(`- Migrated: ${migrated}`);
  console.log(`- Skipped: ${skipped}`);
  console.log(`- Errors: ${errors}`);
}
