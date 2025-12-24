/**
 * Fixed Account List for Journal Entries
 * This is a minimal account list that works without a full Chart of Accounts
 */
export enum JournalEntryAccount {
  // Assets
  CASH_BANK = 'cash_bank',
  ACCOUNTS_RECEIVABLE = 'accounts_receivable',
  VAT_RECEIVABLE = 'vat_receivable',
  PREPAID_EXPENSES = 'prepaid_expenses',
  
  // Liabilities
  ACCOUNTS_PAYABLE = 'accounts_payable',
  VAT_PAYABLE = 'vat_payable',
  CUSTOMER_ADVANCES = 'customer_advances',
  
  // Equity
  SHARE_CAPITAL = 'share_capital',
  OWNER_SHAREHOLDER_ACCOUNT = 'owner_shareholder_account',
  RETAINED_EARNINGS = 'retained_earnings', // System calculated, read-only
  
  // Revenue
  SALES_REVENUE = 'sales_revenue',
  
  // Expense
  GENERAL_EXPENSE = 'general_expense',
}

/**
 * Account metadata for display and categorization
 */
export interface AccountMetadata {
  code: JournalEntryAccount;
  name: string;
  category: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  isReadOnly?: boolean; // For system-calculated accounts like Retained Earnings
}

export const ACCOUNT_METADATA: Record<JournalEntryAccount, AccountMetadata> = {
  [JournalEntryAccount.CASH_BANK]: {
    code: JournalEntryAccount.CASH_BANK,
    name: 'Cash/Bank',
    category: 'asset',
  },
  [JournalEntryAccount.ACCOUNTS_RECEIVABLE]: {
    code: JournalEntryAccount.ACCOUNTS_RECEIVABLE,
    name: 'Accounts Receivable',
    category: 'asset',
  },
  [JournalEntryAccount.VAT_RECEIVABLE]: {
    code: JournalEntryAccount.VAT_RECEIVABLE,
    name: 'VAT Receivable',
    category: 'asset',
  },
  [JournalEntryAccount.PREPAID_EXPENSES]: {
    code: JournalEntryAccount.PREPAID_EXPENSES,
    name: 'Prepaid Expenses',
    category: 'asset',
  },
  [JournalEntryAccount.ACCOUNTS_PAYABLE]: {
    code: JournalEntryAccount.ACCOUNTS_PAYABLE,
    name: 'Accounts Payable',
    category: 'liability',
  },
  [JournalEntryAccount.VAT_PAYABLE]: {
    code: JournalEntryAccount.VAT_PAYABLE,
    name: 'VAT Payable',
    category: 'liability',
  },
  [JournalEntryAccount.CUSTOMER_ADVANCES]: {
    code: JournalEntryAccount.CUSTOMER_ADVANCES,
    name: 'Customer Advances / Unapplied Credits',
    category: 'liability',
  },
  [JournalEntryAccount.SHARE_CAPITAL]: {
    code: JournalEntryAccount.SHARE_CAPITAL,
    name: 'Share Capital',
    category: 'equity',
  },
  [JournalEntryAccount.OWNER_SHAREHOLDER_ACCOUNT]: {
    code: JournalEntryAccount.OWNER_SHAREHOLDER_ACCOUNT,
    name: 'Owner/Shareholder Account',
    category: 'equity',
  },
  [JournalEntryAccount.RETAINED_EARNINGS]: {
    code: JournalEntryAccount.RETAINED_EARNINGS,
    name: 'Retained Earnings',
    category: 'equity',
    isReadOnly: true,
  },
  [JournalEntryAccount.SALES_REVENUE]: {
    code: JournalEntryAccount.SALES_REVENUE,
    name: 'Sales Revenue',
    category: 'revenue',
  },
  [JournalEntryAccount.GENERAL_EXPENSE]: {
    code: JournalEntryAccount.GENERAL_EXPENSE,
    name: 'General Expense',
    category: 'expense',
  },
};

/**
 * Get accounts grouped by category for UI display
 */
export function getAccountsByCategory(): Record<string, AccountMetadata[]> {
  const grouped: Record<string, AccountMetadata[]> = {
    asset: [],
    liability: [],
    equity: [],
    revenue: [],
    expense: [],
  };

  Object.values(ACCOUNT_METADATA).forEach((account) => {
    grouped[account.category].push(account);
  });

  return grouped;
}

/**
 * Get account name by code
 */
export function getAccountName(code: JournalEntryAccount): string {
  return ACCOUNT_METADATA[code]?.name || code;
}

/**
 * Get account category by code
 */
export function getAccountCategory(code: JournalEntryAccount): string {
  return ACCOUNT_METADATA[code]?.category || 'asset';
}

