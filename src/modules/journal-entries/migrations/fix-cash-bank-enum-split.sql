-- Migration Script: Fix cash_bank enum issue (SPLIT VERSION)
-- Use this version if the single-transaction version fails
-- Run each section separately, committing between sections

-- ============================================
-- SECTION 1: Add enum values (Run this first, then COMMIT)
-- ============================================
BEGIN;

-- Add 'cash' to debit_account enum
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_enum 
        WHERE enumlabel = 'cash' 
        AND enumtypid = (
            SELECT oid 
            FROM pg_type 
            WHERE typname = 'journal_entries_debit_account_enum'
        )
    ) THEN
        ALTER TYPE journal_entries_debit_account_enum ADD VALUE 'cash';
    END IF;
END $$;

-- Add 'bank' to debit_account enum
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_enum 
        WHERE enumlabel = 'bank' 
        AND enumtypid = (
            SELECT oid 
            FROM pg_type 
            WHERE typname = 'journal_entries_debit_account_enum'
        )
    ) THEN
        ALTER TYPE journal_entries_debit_account_enum ADD VALUE 'bank';
    END IF;
END $$;

-- Add 'cash' to credit_account enum
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_enum 
        WHERE enumlabel = 'cash' 
        AND enumtypid = (
            SELECT oid 
            FROM pg_type 
            WHERE typname = 'journal_entries_credit_account_enum'
        )
    ) THEN
        ALTER TYPE journal_entries_credit_account_enum ADD VALUE 'cash';
    END IF;
END $$;

-- Add 'bank' to credit_account enum
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_enum 
        WHERE enumlabel = 'bank' 
        AND enumtypid = (
            SELECT oid 
            FROM pg_type 
            WHERE typname = 'journal_entries_credit_account_enum'
        )
    ) THEN
        ALTER TYPE journal_entries_credit_account_enum ADD VALUE 'bank';
    END IF;
END $$;

COMMIT;

-- ============================================
-- SECTION 2: Update data (Run this after SECTION 1 is committed)
-- ============================================
BEGIN;

UPDATE journal_entries 
SET debit_account = 'cash' 
WHERE debit_account = 'cash_bank';

UPDATE journal_entries 
SET credit_account = 'cash' 
WHERE credit_account = 'cash_bank';

COMMIT;

-- ============================================
-- SECTION 3: Remove cash_bank from enums (Run this after SECTION 2 is committed)
-- ============================================
BEGIN;

-- Remove cash_bank from debit_account enum
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM pg_enum 
        WHERE enumlabel = 'cash_bank' 
        AND enumtypid = (
            SELECT oid 
            FROM pg_type 
            WHERE typname = 'journal_entries_debit_account_enum'
        )
    ) THEN
        -- Create new enum without cash_bank
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
        
        -- Update column
        ALTER TABLE journal_entries 
        ALTER COLUMN debit_account TYPE journal_entries_debit_account_enum_new 
        USING debit_account::text::journal_entries_debit_account_enum_new;
        
        -- Drop old and rename new
        DROP TYPE journal_entries_debit_account_enum;
        ALTER TYPE journal_entries_debit_account_enum_new 
        RENAME TO journal_entries_debit_account_enum;
    END IF;
END $$;

-- Remove cash_bank from credit_account enum
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM pg_enum 
        WHERE enumlabel = 'cash_bank' 
        AND enumtypid = (
            SELECT oid 
            FROM pg_type 
            WHERE typname = 'journal_entries_credit_account_enum'
        )
    ) THEN
        -- Create new enum without cash_bank
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
        
        -- Update column
        ALTER TABLE journal_entries 
        ALTER COLUMN credit_account TYPE journal_entries_credit_account_enum_new 
        USING credit_account::text::journal_entries_credit_account_enum_new;
        
        -- Drop old and rename new
        DROP TYPE journal_entries_credit_account_enum;
        ALTER TYPE journal_entries_credit_account_enum_new 
        RENAME TO journal_entries_credit_account_enum;
    END IF;
END $$;

COMMIT;

-- ============================================
-- SECTION 4: Verify (Run this at the end)
-- ============================================
SELECT 
    COUNT(*) FILTER (WHERE debit_account::text = 'cash_bank') as debit_cash_bank_count,
    COUNT(*) FILTER (WHERE credit_account::text = 'cash_bank') as credit_cash_bank_count,
    COUNT(*) FILTER (WHERE debit_account::text = 'cash') as debit_cash_count,
    COUNT(*) FILTER (WHERE credit_account::text = 'cash') as credit_cash_count
FROM journal_entries;

