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

type QBInfo = {
  repo: string;
  selects: any;
  wheres: any[];
};

class SmartQueryBuilder {
  private selects: any;
  private wheres: any[] = [];
  constructor(
    private readonly repo: string,
    private readonly resolver: (info: QBInfo) => { one?: any; many?: any[] },
  ) {}

  // chainable
  leftJoin() {
    return this;
  }
  leftJoinAndSelect() {
    return this;
  }
  select(sel: any) {
    this.selects = sel;
    return this;
  }
  where(w: any) {
    this.wheres.push(w);
    return this;
  }
  andWhere(w: any) {
    this.wheres.push(w);
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
    return 'SMART_QB';
  }
  getSql() {
    return 'SMART_QB';
  }

  async getRawOne() {
    return (
      this.resolver({
        repo: this.repo,
        selects: this.selects,
        wheres: this.wheres,
      }).one ?? {}
    );
  }
  async getRawMany() {
    return (
      this.resolver({
        repo: this.repo,
        selects: this.selects,
        wheres: this.wheres,
      }).many ?? []
    );
  }
  async getMany() {
    return [];
  }
}

function makeSmartRepo(
  repo: string,
  resolver: (info: QBInfo) => { one?: any; many?: any[] },
) {
  return {
    createQueryBuilder: jest.fn(() => new SmartQueryBuilder(repo, resolver)),
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    save: jest.fn(async (x: any) => x),
    create: jest.fn((x: any) => x),
  };
}

describe('ReportsService report consistency (custom ledger JEs, cash counterparty)', () => {
  it('Custom ledger JE paid/received in cash moves TB, P&L, and BS retained earnings consistently', async () => {
    const organizationId = 'org-1';
    const revId = 'rev-1';
    const expId = 'exp-1';
    const revCode = `ledger:${revId}`;
    const expCode = `ledger:${expId}`;

    // Revenue JE: Dr Cash 100 / Cr Custom Revenue 100
    // Expense JE: Dr Custom Expense 40 / Cr Cash 40
    // Net profit: 60 -> Retained earnings +60, Cash +60
    const journalGroupedRows = [
      { debitaccount: 'cash', creditaccount: revCode, amount: '100', vat: '0' },
      { debitaccount: expCode, creditaccount: 'cash', amount: '40', vat: '0' },
    ];

    const ledgerAccountsRepo = makeSmartRepo('ledgerAccounts', () => ({
      one: {},
      many: [],
    }));
    ledgerAccountsRepo.find = jest.fn(async () => [
      {
        id: revId,
        name: 'JE Revenue',
        category: 'revenue',
        organization: { id: organizationId },
      } as any,
      {
        id: expId,
        name: 'JE Expense',
        category: 'expense',
        organization: { id: organizationId },
      } as any,
    ]);

    const journalEntriesRepo = makeSmartRepo(
      'journalEntries',
      ({ selects }: QBInfo) => {
        const selectText = Array.isArray(selects)
          ? selects.join(' ')
          : String(selects ?? '');

        // P&L fixed-account JE aggregates (sales_revenue/general_expense) => 0
        if (
          selectText.includes('AS revenueCredit') &&
          selectText.includes('sales_revenue')
        ) {
          return {
            one: {
              revenuecredit: 0,
              revenuedebit: 0,
              revenuevatcredit: 0,
              revenuevatdebit: 0,
              expensedebit: 0,
              expensecredit: 0,
              expensevatdebit: 0,
              expensevatcredit: 0,
            },
          };
        }

        // Custom-ledger P&L rawMany uses SUM(entry.amount) AS amount + SUM(COALESCE(entry.vat_amount...)) AS vat
        if (
          selectText.includes('SUM(entry.amount) AS amount') &&
          selectText.includes('SUM(COALESCE(entry.vat_amount')
        ) {
          return { many: journalGroupedRows };
        }

        // TB/BS JE grouped by account uses SUM(entry.amount) AS amount (no vat sum)
        if (
          selectText.includes('SUM(entry.amount) AS amount') &&
          !selectText.includes('vat_amount')
        ) {
          return { many: journalGroupedRows };
        }

        // Cash/Bank JE helpers return received/paid
        if (
          selectText.includes('AS received') &&
          selectText.includes('AS paid')
        ) {
          // For cash queries, revenue JE contributes received=100; expense JE contributes paid=40
          return { one: { received: 100, paid: 40 } };
        }

        return { one: {}, many: [] };
      },
    );

    // Everything else returns 0/empty
    const zeroOne = () => ({ one: {} });
    const zeroMany = () => ({ many: [] });
    const expensesRepo = makeSmartRepo('expenses', ({ selects }: QBInfo) => {
      const selectText = Array.isArray(selects)
        ? selects.join(' ')
        : String(selects ?? '');
      // P&L expense by category returns none
      if (selectText.includes('AS category') && selectText.includes('SUM('))
        return { many: [] };
      // Opening/BS expenses sums => 0
      if (selectText.includes('AS amount')) return { one: { amount: 0 } };
      return { one: {} };
    });
    const salesInvoicesRepo = makeSmartRepo('salesInvoices', () => ({
      one: { revenue: 0, vat: 0, count: 0 },
    }));
    const creditNotesRepo = makeSmartRepo('creditNotes', () => ({
      one: { amount: 0, vat: 0, count: 0, creditNotes: 0, creditnotes: 0 },
    }));
    const debitNotesRepo = makeSmartRepo('debitNotes', () => ({
      one: { amount: 0, vat: 0, count: 0, debitNotes: 0, debitnotes: 0 },
    }));
    const invoicePaymentsRepo = makeSmartRepo('invoicePayments', () => ({
      one: {},
    }));
    const expensePaymentsRepo = makeSmartRepo('expensePayments', () => ({
      one: {},
    }));
    const accrualsRepo = makeSmartRepo('accruals', () => ({ one: {} }));
    const reportsRepo = makeSmartRepo('reports', zeroOne);
    const orgsRepo = makeSmartRepo('orgs', zeroOne);
    const creditNoteAppsRepo = makeSmartRepo('creditNoteApps', zeroOne);
    const debitNoteAppsRepo = makeSmartRepo('debitNoteApps', zeroOne);
    const debitNoteExpenseAppsRepo = makeSmartRepo(
      'debitNoteExpenseApps',
      zeroOne,
    );
    const productsRepo = makeSmartRepo('products', zeroMany);
    const stockMovementsRepo = makeSmartRepo('stockMovements', zeroMany);

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

    const filters = { startDate: '2026-01-01', endDate: '2026-01-31' };
    const pnl = await (service as any).buildProfitAndLoss(
      organizationId,
      filters,
    );
    expect(pnl.summary.netProfit).toBe(60);

    const tb = await (service as any).buildTrialBalance(
      organizationId,
      filters,
    );
    const tbExpense = tb.accounts.find(
      (a: any) => a.accountName === 'JE Expense',
    );
    const tbRevenue = tb.accounts.find(
      (a: any) => a.accountName === 'JE Revenue',
    );
    expect(tbExpense).toBeTruthy();
    expect(tbExpense.accountType).toBe('Expense');
    expect(tbRevenue).toBeTruthy();
    expect(tbRevenue.accountType).toBe('Revenue');

    const tbRE = tb.accounts.find(
      (a: any) => a.accountName === 'Retained Earnings / Current Year Profit',
    );
    expect(tbRE).toBeTruthy();
    expect(Number(tbRE.balance.toFixed(2))).toBe(60);

    const bs = await (service as any).buildBalanceSheet(organizationId, {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
    const bsRE = bs.equity.items.find(
      (i: any) => i.account === 'Retained Earnings',
    );
    expect(bsRE).toBeTruthy();
    expect(bsRE.closing).toBe(60);
  });

  it('Mixed flow (invoice + expense + custom JE) matches retained earnings across P&L and BS', async () => {
    const organizationId = 'org-1';
    const revId = 'rev-1';
    const expId = 'exp-1';
    const revCode = `ledger:${revId}`;
    const expCode = `ledger:${expId}`;

    // Invoice revenue = 200, Expense = 50, JE revenue = +30, JE expense = +10 => net profit 170
    const journalGroupedRows = [
      { debitaccount: 'cash', creditaccount: revCode, amount: '30', vat: '0' },
      { debitaccount: expCode, creditaccount: 'cash', amount: '10', vat: '0' },
    ];

    const ledgerAccountsRepo = makeSmartRepo('ledgerAccounts', () => ({
      one: {},
      many: [],
    }));
    ledgerAccountsRepo.find = jest.fn(async () => [
      {
        id: revId,
        name: 'JE Revenue',
        category: 'revenue',
        organization: { id: organizationId },
      } as any,
      {
        id: expId,
        name: 'JE Expense',
        category: 'expense',
        organization: { id: organizationId },
      } as any,
    ]);

    const journalEntriesRepo = makeSmartRepo(
      'journalEntries',
      ({ selects }: QBInfo) => {
        const selectText = Array.isArray(selects)
          ? selects.join(' ')
          : String(selects ?? '');
        if (
          selectText.includes('AS revenueCredit') &&
          selectText.includes('sales_revenue')
        ) {
          return {
            one: {
              revenuecredit: 0,
              revenuedebit: 0,
              revenuevatcredit: 0,
              revenuevatdebit: 0,
              expensedebit: 0,
              expensecredit: 0,
              expensevatdebit: 0,
              expensevatcredit: 0,
            },
          };
        }
        if (
          selectText.includes('SUM(entry.amount) AS amount') &&
          selectText.includes('SUM(COALESCE(entry.vat_amount')
        ) {
          return { many: journalGroupedRows };
        }
        if (
          selectText.includes('SUM(entry.amount) AS amount') &&
          !selectText.includes('vat_amount')
        ) {
          return { many: journalGroupedRows };
        }
        if (
          selectText.includes('AS received') &&
          selectText.includes('AS paid')
        ) {
          return { one: { received: 30, paid: 10 } };
        }
        return { one: {}, many: [] };
      },
    );

    const salesInvoicesRepo = makeSmartRepo(
      'salesInvoices',
      ({ selects }: QBInfo) => {
        const selectText = Array.isArray(selects)
          ? selects.join(' ')
          : String(selects ?? '');
        if (selectText.includes('AS revenue') && selectText.includes('COUNT')) {
          return { one: { revenue: 200, vat: 0, count: 1 } };
        }
        if (selectText.includes('AS revenue')) return { one: { revenue: 200 } };
        if (
          selectText.includes('AS invoiceAmount') ||
          selectText.includes('AS amount')
        )
          return { one: { amount: 0, invoiceamount: 0 } };
        return { one: {} };
      },
    );

    const expensesRepo = makeSmartRepo('expenses', ({ selects }: QBInfo) => {
      const selectText = Array.isArray(selects)
        ? selects.join(' ')
        : String(selects ?? '');
      // P&L breakdown
      if (selectText.includes('AS category') && selectText.includes('SUM(')) {
        return {
          many: [{ category: 'Office', amount: '50', vat: '0', count: '1' }],
        };
      }
      // TB breakdown uses accountName/accountType/debit
      if (
        selectText.includes('AS accountName') &&
        selectText.includes('AS debit')
      ) {
        return {
          many: [
            {
              accountname: 'Office',
              accounttype: 'Expense',
              debit: '50',
              credit: '0',
            },
          ],
        };
      }
      // Sum expenses
      if (selectText.includes('AS amount')) return { one: { amount: 50 } };
      return { one: {} };
    });

    const creditNotesRepo = makeSmartRepo('creditNotes', () => ({
      one: { amount: 0, vat: 0, count: 0, creditNotes: 0, creditnotes: 0 },
    }));
    const debitNotesRepo = makeSmartRepo('debitNotes', () => ({
      one: { amount: 0, vat: 0, count: 0, debitNotes: 0, debitnotes: 0 },
    }));
    const invoicePaymentsRepo = makeSmartRepo('invoicePayments', () => ({
      one: {},
    }));
    const expensePaymentsRepo = makeSmartRepo('expensePayments', () => ({
      one: {},
    }));
    const accrualsRepo = makeSmartRepo('accruals', () => ({ one: {} }));
    const reportsRepo = makeSmartRepo('reports', () => ({ one: {} }));
    const orgsRepo = makeSmartRepo('orgs', () => ({ one: {} }));
    const creditNoteAppsRepo = makeSmartRepo('creditNoteApps', () => ({
      one: {},
    }));
    const debitNoteAppsRepo = makeSmartRepo('debitNoteApps', () => ({
      one: {},
    }));
    const debitNoteExpenseAppsRepo = makeSmartRepo(
      'debitNoteExpenseApps',
      () => ({ one: {} }),
    );
    const productsRepo = makeSmartRepo('products', () => ({ many: [] }));
    const stockMovementsRepo = makeSmartRepo('stockMovements', () => ({
      many: [],
    }));

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
    const filters = { startDate: '2026-01-01', endDate: '2026-01-31' };

    const pnl = await (service as any).buildProfitAndLoss(
      organizationId,
      filters,
    );
    expect(pnl.summary.netProfit).toBe(170);

    const bs = await (service as any).buildBalanceSheet(organizationId, {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
    const bsRE = bs.equity.items.find(
      (i: any) => i.account === 'Retained Earnings',
    );
    expect(bsRE).toBeTruthy();
    expect(bsRE.closing).toBe(170);
  });
});
