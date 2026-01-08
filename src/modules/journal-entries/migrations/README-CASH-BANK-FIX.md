# Fix Cash Bank Enum Issue

## Problem
The database enum types `journal_entries_debit_account_enum` and `journal_entries_credit_account_enum` contain the value `cash_bank`, but the TypeScript enum `JournalEntryAccount` only has `cash` and `bank` (not `cash_bank`).

When TypeORM tries to synchronize the schema, it fails with:
```
QueryFailedError: invalid input value for enum journal_entries_debit_account_enum: "cash_bank"
```

## Solution

### Option 1: Run SQL Migration Script (Recommended)

1. **Connect to your PostgreSQL database**:
   ```bash
   psql -h localhost -U postgres -d smart_expense_uae
   ```

2. **Run the migration script**:
   ```sql
   \i backend/smart-expense-api/src/modules/journal-entries/migrations/fix-cash-bank-enum.sql
   ```
   
   Or copy and paste the contents of `fix-cash-bank-enum.sql` into your psql session.

3. **Verify the migration**:
   - The script will output counts showing:
     - `debit_cash_bank_count` and `credit_cash_bank_count` should be 0
     - `debit_cash_count` and `credit_cash_count` should be > 0 (if you had cash_bank entries)

4. **Restart your application** - TypeORM should now be able to synchronize without errors.

### Option 2: Disable Synchronize and Use Migrations

If you prefer to use TypeORM migrations instead of synchronize:

1. **Set in `.env`**:
   ```
   DB_SYNCHRONIZE=false
   ```

2. **Run the data migration script** (`migrate-cash-bank-to-cash.ts`) first to update the data.

3. **Then manually update the enum** using the SQL script above.

### Option 3: Temporary Workaround

If you need to start the application immediately:

1. **Temporarily add `cash_bank` to the TypeScript enum**:
   ```typescript
   export enum JournalEntryAccount {
     CASH = 'cash',
     BANK = 'bank',
     CASH_BANK = 'cash_bank', // Temporary - remove after migration
     // ... rest of enum
   }
   ```

2. **Start the application** - it should work now.

3. **Run the migration script** to update data and remove `cash_bank` from database enum.

4. **Remove `CASH_BANK` from TypeScript enum** and restart.

## What the Migration Script Does

1. **Updates all journal entries**: Changes `cash_bank` to `cash` in both `debit_account` and `credit_account` columns.

2. **Removes `cash_bank` from enum types**: 
   - Creates new enum types without `cash_bank`
   - Updates the columns to use the new enum types
   - Drops the old enum types
   - Renames the new enum types to the original names

3. **Verifies the migration**: Shows counts to confirm all `cash_bank` values were migrated.

## Important Notes

- **Backup your database** before running the migration script.
- The migration is **idempotent** - you can run it multiple times safely.
- After migration, all `cash_bank` entries will be converted to `cash`.
- If you need to distinguish between cash and bank for historical entries, you'll need to manually review and update them.

## After Migration

Once the migration is complete:
- TypeORM synchronize should work without errors
- All journal entries will use `cash` or `bank` (not `cash_bank`)
- The enum types will match the TypeScript enum definition

