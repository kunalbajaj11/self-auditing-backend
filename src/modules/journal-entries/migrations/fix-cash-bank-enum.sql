-- Migration Script: Fix cash_bank enum issue
-- This script:
-- 1. Creates new enum types with all correct values (including cash and bank)
-- 2. Updates all journal entries with cash_bank to cash
-- 3. Replaces the old enum types with the new ones
-- 4. Ensures the enum matches the TypeScript JournalEntryAccount enum
--
-- NOTE: This script must be run in a single transaction or split into separate transactions
-- due to PostgreSQL's requirement that new enum values be committed before use.

-- Step 1: Create new enum types with all correct values (including cash and bank, excluding cash_bank)
CREATE TYPE journal_entries_debit_account_enum_new AS ENUM (
    'cash',
    'bank',
    'accounts_receivable',
    'vat_receivable',
    'prepaid_expenses',
    'accounts_payable',
    'vat_payable',
    'customer_advances',
    'share_capital',
    'owner_shareholder_account',
    'retained_earnings',
    'sales_revenue',
    'general_expense'
);

CREATE TYPE journal_entries_credit_account_enum_new AS ENUM (
    'cash',
    'bank',
    'accounts_receivable',
    'vat_receivable',
    'prepaid_expenses',
    'accounts_payable',
    'vat_payable',
    'customer_advances',
    'share_capital',
    'owner_shareholder_account',
    'retained_earnings',
    'sales_revenue',
    'general_expense'
);

-- Step 2: Update all journal entries with cash_bank to cash BEFORE changing the column type
-- This uses text casting to work around the enum constraint
UPDATE journal_entries 
SET debit_account = 'cash'::text 
WHERE debit_account::text = 'cash_bank';

UPDATE journal_entries 
SET credit_account = 'cash'::text 
WHERE credit_account::text = 'cash_bank';

-- Step 3: Change the column types to use the new enum types
-- This will convert existing values to the new enum
ALTER TABLE journal_entries 
ALTER COLUMN debit_account TYPE journal_entries_debit_account_enum_new 
USING CASE 
    WHEN debit_account::text = 'cash_bank' THEN 'cash'::journal_entries_debit_account_enum_new
    ELSE debit_account::text::journal_entries_debit_account_enum_new
END;

ALTER TABLE journal_entries 
ALTER COLUMN credit_account TYPE journal_entries_credit_account_enum_new 
USING CASE 
    WHEN credit_account::text = 'cash_bank' THEN 'cash'::journal_entries_credit_account_enum_new
    ELSE credit_account::text::journal_entries_credit_account_enum_new
END;

-- Step 4: Drop the old enum types
DROP TYPE IF EXISTS journal_entries_debit_account_enum;
DROP TYPE IF EXISTS journal_entries_credit_account_enum;

-- Step 5: Rename the new enum types to the original names
ALTER TYPE journal_entries_debit_account_enum_new 
RENAME TO journal_entries_debit_account_enum;

ALTER TYPE journal_entries_credit_account_enum_new 
RENAME TO journal_entries_credit_account_enum;

-- Step 6: Verify the migration
SELECT 
    COUNT(*) FILTER (WHERE debit_account::text = 'cash_bank') as debit_cash_bank_count,
    COUNT(*) FILTER (WHERE credit_account::text = 'cash_bank') as credit_cash_bank_count,
    COUNT(*) FILTER (WHERE debit_account::text = 'cash') as debit_cash_count,
    COUNT(*) FILTER (WHERE credit_account::text = 'cash') as credit_cash_count,
    COUNT(*) FILTER (WHERE debit_account::text = 'bank') as debit_bank_count,
    COUNT(*) FILTER (WHERE credit_account::text = 'bank') as credit_bank_count
FROM journal_entries;

-- Should show:
-- - debit_cash_bank_count = 0
-- - credit_cash_bank_count = 0
-- - debit_cash_count > 0 (if you had cash_bank entries)
-- - credit_cash_count > 0 (if you had cash_bank entries)
