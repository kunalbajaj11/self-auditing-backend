import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ReportsService } from './reports.service';
import { SettingsService } from '../settings/settings.service';

import { Expense } from '../../entities/expense.entity';
import { Accrual } from '../../entities/accrual.entity';
import { Report } from '../../entities/report.entity';
import { Organization } from '../../entities/organization.entity';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { ExpensePayment } from '../../entities/expense-payment.entity';
import { InvoicePayment } from '../../entities/invoice-payment.entity';
import { JournalEntry } from '../../entities/journal-entry.entity';
import { CreditNote } from '../../entities/credit-note.entity';
import { DebitNote } from '../../entities/debit-note.entity';
import { LedgerAccount } from '../../entities/ledger-account.entity';
import { CreditNoteApplication } from '../../entities/credit-note-application.entity';
import { DebitNoteApplication } from '../../entities/debit-note-application.entity';
import { DebitNoteExpenseApplication } from '../../entities/debit-note-expense-application.entity';
import { Product } from '../products/product.entity';
import { StockMovement } from '../inventory/entities/stock-movement.entity';

type RawRow = Record<string, any>;

class FakeQueryBuilder {
  private rawMany: RawRow[] = [];
  private rawOne: RawRow | null = null;
  private sql = 'FAKE_SQL';

  setRawMany(rows: RawRow[]) {
    this.rawMany = rows;
    return this;
  }
  setRawOne(row: RawRow | null) {
    this.rawOne = row;
    return this;
  }

  // Chainable no-ops
  leftJoin() {
    return this;
  }
  leftJoinAndSelect() {
    return this;
  }
  select() {
    return this;
  }
  where() {
    return this;
  }
  andWhere() {
    return this;
  }
  groupBy() {
    return this;
  }
  addGroupBy() {
    return this;
  }
  orderBy() {
    return this;
  }
  setParameter() {
    return this;
  }
  getQuery() {
    return this.sql;
  }
  getSql() {
    return this.sql;
  }

  async getRawMany() {
    return this.rawMany;
  }
  async getRawOne() {
    return this.rawOne;
  }
  async getMany() {
    return [];
  }
}

function makeRepoMock() {
  const qb = new FakeQueryBuilder();
  return {
    __qb: qb,
    createQueryBuilder: jest.fn(() => qb),
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    save: jest.fn(async (x: any) => x),
    create: jest.fn((x: any) => x),
  };
}

describe('ReportsService (JE + custom ledger accounts)', () => {
  it('P&L includes custom ledger JE revenue/expense and updates retained earnings math', async () => {
    const organizationId = 'org-1';
    const customRevenueId = 'rev-1';
    const customExpenseId = 'exp-1';
    const customRevenueCode = `ledger:${customRevenueId}`;
    const customExpenseCode = `ledger:${customExpenseId}`;

    const expensesRepo = makeRepoMock();
    const accrualsRepo = makeRepoMock();
    const reportsRepo = makeRepoMock();
    const orgsRepo = makeRepoMock();
    const salesInvoicesRepo = makeRepoMock();
    const expensePaymentsRepo = makeRepoMock();
    const invoicePaymentsRepo = makeRepoMock();
    const journalEntriesRepo = makeRepoMock();
    const creditNotesRepo = makeRepoMock();
    const debitNotesRepo = makeRepoMock();
    const ledgerAccountsRepo = makeRepoMock();
    const creditNoteAppsRepo = makeRepoMock();
    const debitNoteAppsRepo = makeRepoMock();
    const debitNoteExpenseAppsRepo = makeRepoMock();
    const productsRepo = makeRepoMock();
    const stockMovementsRepo = makeRepoMock();

    // P&L uses: invoices/creditNotes/debitNotes -> getRawOne
    salesInvoicesRepo.__qb.setRawOne({ revenue: 0, vat: 0, count: 0 });
    creditNotesRepo.__qb.setRawOne({ amount: 0, vat: 0, count: 0 });
    debitNotesRepo.__qb.setRawOne({ amount: 0, vat: 0, count: 0 });

    // P&L uses: expenses by category -> getRawMany, payroll -> getRawOne
    expensesRepo.__qb.setRawMany([]);
    // payroll query is also on expensesRepo; we can return 0 safely
    expensesRepo.__qb.setRawOne({ amount: 0, vat: 0, count: 0 });

    // P&L JE fixed-account queries: return 0
    // (same qb instance; we will rely on custom-ledger JE being the only effect)
    journalEntriesRepo.__qb.setRawOne({
      revenuecredit: 0,
      revenuedebit: 0,
      revenuevatcredit: 0,
      revenuevatdebit: 0,
      expensedebit: 0,
      expensecredit: 0,
      expensevatdebit: 0,
      expensevatcredit: 0,
    });

    // P&L custom-ledger rows: two rows
    // - Credit revenue ledger 100
    // - Debit expense ledger 40
    const periodCustomRows: RawRow[] = [
      {
        debitaccount: 'cash',
        creditaccount: customRevenueCode,
        amount: '100',
        vat: '0',
      },
      {
        debitaccount: customExpenseCode,
        creditaccount: 'cash',
        amount: '40',
        vat: '0',
      },
    ];
    const openingCustomRows: RawRow[] = [];

    // We need getRawMany for custom-ledger query to return our rows.
    // Since FakeQueryBuilder instance is shared, we simulate by setting rawMany to period rows;
    // and for opening rows tests we keep opening rows empty (the service queries both; both getRawMany() will return same).
    // To keep deterministic, we set it to period rows, and opening is effectively 0 for this test.
    journalEntriesRepo.__qb.setRawMany(periodCustomRows);

    // Ledger account lookup must return category + name
    ledgerAccountsRepo.find = jest.fn(async () => [
      {
        id: customRevenueId,
        name: 'Custom Revenue',
        category: 'revenue',
        organization: { id: organizationId },
      } as any,
      {
        id: customExpenseId,
        name: 'Custom Expense',
        category: 'expense',
        organization: { id: organizationId },
      } as any,
    ]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: SettingsService,
          useValue: {
            getTaxSettings: jest.fn(async () => ({ taxYearEnd: null })),
          },
        },
        { provide: DataSource, useValue: {} },
        { provide: getRepositoryToken(Expense), useValue: expensesRepo },
        { provide: getRepositoryToken(Accrual), useValue: accrualsRepo },
        { provide: getRepositoryToken(Report), useValue: reportsRepo },
        { provide: getRepositoryToken(Organization), useValue: orgsRepo },
        {
          provide: getRepositoryToken(SalesInvoice),
          useValue: salesInvoicesRepo,
        },
        {
          provide: getRepositoryToken(ExpensePayment),
          useValue: expensePaymentsRepo,
        },
        {
          provide: getRepositoryToken(InvoicePayment),
          useValue: invoicePaymentsRepo,
        },
        {
          provide: getRepositoryToken(JournalEntry),
          useValue: journalEntriesRepo,
        },
        { provide: getRepositoryToken(CreditNote), useValue: creditNotesRepo },
        { provide: getRepositoryToken(DebitNote), useValue: debitNotesRepo },
        {
          provide: getRepositoryToken(LedgerAccount),
          useValue: ledgerAccountsRepo,
        },
        {
          provide: getRepositoryToken(CreditNoteApplication),
          useValue: creditNoteAppsRepo,
        },
        {
          provide: getRepositoryToken(DebitNoteApplication),
          useValue: debitNoteAppsRepo,
        },
        {
          provide: getRepositoryToken(DebitNoteExpenseApplication),
          useValue: debitNoteExpenseAppsRepo,
        },
        { provide: getRepositoryToken(Product), useValue: productsRepo },
        {
          provide: getRepositoryToken(StockMovement),
          useValue: stockMovementsRepo,
        },
      ],
    }).compile();

    const service = moduleRef.get(ReportsService);

    const pnl = await (service as any).buildProfitAndLoss(organizationId, {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });

    // Revenue should include +100 from custom revenue JE
    expect(pnl.revenue.netAmount).toBe(100);
    // Expenses should include +40 from custom expense JE
    expect(pnl.expenses.total).toBe(40);
    // Net profit should be 60
    expect(pnl.summary.netProfit).toBe(60);
    // Expense breakdown should include custom expense line item
    const customExpenseLine = pnl.expenses.items.find(
      (i: any) => i.category === 'Custom Expense (Journal Entry)',
    );
    expect(customExpenseLine).toBeTruthy();
    expect(customExpenseLine.amount).toBe(40);
  });

  it('TB resolves custom ledger accounts to name/type instead of raw ledger:{id}', async () => {
    const organizationId = 'org-1';
    const customExpenseId = 'exp-1';
    const customExpenseCode = `ledger:${customExpenseId}`;

    const expensesRepo = makeRepoMock();
    const accrualsRepo = makeRepoMock();
    const reportsRepo = makeRepoMock();
    const orgsRepo = makeRepoMock();
    const salesInvoicesRepo = makeRepoMock();
    const expensePaymentsRepo = makeRepoMock();
    const invoicePaymentsRepo = makeRepoMock();
    const journalEntriesRepo = makeRepoMock();
    const creditNotesRepo = makeRepoMock();
    const debitNotesRepo = makeRepoMock();
    const ledgerAccountsRepo = makeRepoMock();
    const creditNoteAppsRepo = makeRepoMock();
    const debitNoteAppsRepo = makeRepoMock();
    const debitNoteExpenseAppsRepo = makeRepoMock();
    const productsRepo = makeRepoMock();
    const stockMovementsRepo = makeRepoMock();

    // Make everything else empty/zero so JE is the only account we see.
    expensesRepo.__qb.setRawMany([]);
    salesInvoicesRepo.__qb.setRawOne({ credit: 0 });
    creditNotesRepo.__qb.setRawOne({ amount: 0 });
    debitNotesRepo.__qb.setRawOne({ amount: 0 });
    accrualsRepo.__qb.setRawOne({ credit: 0 });
    invoicePaymentsRepo.__qb.setRawOne({ cashreceipts: 0, bankreceipts: 0 });
    expensePaymentsRepo.__qb.setRawOne({ cashpayments: 0, bankpayments: 0 });

    // TB JE period rows – debit custom expense, credit AP (liability) so it should appear.
    journalEntriesRepo.__qb.setRawMany([
      {
        debitaccount: customExpenseCode,
        creditaccount: 'accounts_payable',
        amount: '25',
      },
    ]);

    ledgerAccountsRepo.find = jest.fn(async () => [
      {
        id: customExpenseId,
        name: 'Marketing Expense',
        category: 'expense',
        organization: { id: organizationId },
      } as any,
    ]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: SettingsService,
          useValue: {
            getTaxSettings: jest.fn(async () => ({ taxYearEnd: null })),
          },
        },
        { provide: DataSource, useValue: {} },
        { provide: getRepositoryToken(Expense), useValue: expensesRepo },
        { provide: getRepositoryToken(Accrual), useValue: accrualsRepo },
        { provide: getRepositoryToken(Report), useValue: reportsRepo },
        { provide: getRepositoryToken(Organization), useValue: orgsRepo },
        {
          provide: getRepositoryToken(SalesInvoice),
          useValue: salesInvoicesRepo,
        },
        {
          provide: getRepositoryToken(ExpensePayment),
          useValue: expensePaymentsRepo,
        },
        {
          provide: getRepositoryToken(InvoicePayment),
          useValue: invoicePaymentsRepo,
        },
        {
          provide: getRepositoryToken(JournalEntry),
          useValue: journalEntriesRepo,
        },
        { provide: getRepositoryToken(CreditNote), useValue: creditNotesRepo },
        { provide: getRepositoryToken(DebitNote), useValue: debitNotesRepo },
        {
          provide: getRepositoryToken(LedgerAccount),
          useValue: ledgerAccountsRepo,
        },
        {
          provide: getRepositoryToken(CreditNoteApplication),
          useValue: creditNoteAppsRepo,
        },
        {
          provide: getRepositoryToken(DebitNoteApplication),
          useValue: debitNoteAppsRepo,
        },
        {
          provide: getRepositoryToken(DebitNoteExpenseApplication),
          useValue: debitNoteExpenseAppsRepo,
        },
        { provide: getRepositoryToken(Product), useValue: productsRepo },
        {
          provide: getRepositoryToken(StockMovement),
          useValue: stockMovementsRepo,
        },
      ],
    }).compile();

    const service = moduleRef.get(ReportsService);

    const tb = await (service as any).buildTrialBalance(organizationId, {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });

    const marketing = tb.accounts.find(
      (a: any) => a.accountName === 'Marketing Expense',
    );
    expect(marketing).toBeTruthy();
    expect(marketing.accountType).toBe('Expense');
  });
});
