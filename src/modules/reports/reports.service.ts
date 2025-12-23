import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { CreditNoteApplication } from '../../entities/credit-note-application.entity';
import { GenerateReportDto } from './dto/generate-report.dto';
import { ReportHistoryFilterDto } from './dto/report-history-filter.dto';
import { ReportType } from '../../common/enums/report-type.enum';
import { AccrualStatus } from '../../common/enums/accrual-status.enum';
import { PaymentStatus } from '../../common/enums/payment-status.enum';
import { CreditNoteStatus } from '../../common/enums/credit-note-status.enum';
import { DebitNoteStatus } from '../../common/enums/debit-note-status.enum';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
    @InjectRepository(Accrual)
    private readonly accrualsRepository: Repository<Accrual>,
    @InjectRepository(Report)
    private readonly reportsRepository: Repository<Report>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(SalesInvoice)
    private readonly salesInvoicesRepository: Repository<SalesInvoice>,
    @InjectRepository(ExpensePayment)
    private readonly expensePaymentsRepository: Repository<ExpensePayment>,
    @InjectRepository(InvoicePayment)
    private readonly invoicePaymentsRepository: Repository<InvoicePayment>,
    @InjectRepository(JournalEntry)
    private readonly journalEntriesRepository: Repository<JournalEntry>,
    @InjectRepository(CreditNote)
    private readonly creditNotesRepository: Repository<CreditNote>,
    @InjectRepository(DebitNote)
    private readonly debitNotesRepository: Repository<DebitNote>,
    @InjectRepository(CreditNoteApplication)
    private readonly creditNoteApplicationsRepository: Repository<CreditNoteApplication>,
    private readonly settingsService: SettingsService,
  ) {}

  async listHistory(
    organizationId: string,
    filters: ReportHistoryFilterDto,
  ): Promise<Report[]> {
    const query = this.reportsRepository
      .createQueryBuilder('report')
      .where('report.organization_id = :organizationId', { organizationId });
    if (filters.type) {
      query.andWhere('report.type = :type', { type: filters.type });
    }
    query.orderBy('report.created_at', 'DESC');
    return query.getMany();
  }

  async findById(id: string, organizationId: string): Promise<Report | null> {
    return this.reportsRepository.findOne({
      where: {
        id,
        organization: { id: organizationId },
      },
    });
  }

  async getFilterOptions(organizationId: string): Promise<{
    vendors: string[];
    customers: string[];
    categories: string[];
  }> {
    const vendorResults = await this.expensesRepository
      .createQueryBuilder('expense')
      .select('expense.vendor_name', 'vendorName')
      .distinct(true)
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.vendor_name IS NOT NULL')
      .andWhere("expense.vendor_name != ''")
      .orderBy('expense.vendor_name', 'ASC')
      .getRawMany();

    const customerResults = await this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .leftJoin('invoice.customer', 'customer')
      .select('COALESCE(customer.name, invoice.customer_name)', 'customerName')
      .distinct(true)
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('COALESCE(customer.name, invoice.customer_name) IS NOT NULL')
      .andWhere("COALESCE(customer.name, invoice.customer_name) != ''")
      .orderBy('customerName', 'ASC')
      .getRawMany();

    const vendors = vendorResults
      .map((r) => r.vendorname || r.vendorName || r.vendor_name)
      .filter((v) => v)
      .sort();

    const customers = customerResults
      .map((r) => r.customername || r.customerName || r.customer_name)
      .filter((c) => c)
      .sort();

    return {
      vendors,
      customers,
      categories: [],
    };
  }

  async generate(
    organizationId: string,
    userId: string,
    dto: GenerateReportDto,
  ): Promise<{
    type: ReportType;
    generatedAt: Date;
    data: any;
    summary?: any;
  }> {
    let data: any = null;
    let summary: any = null;

    switch (dto.type) {
      case ReportType.TRIAL_BALANCE:
        data = await this.buildTrialBalance(organizationId, dto.filters);
        break;
      case ReportType.BALANCE_SHEET:
        data = await this.buildBalanceSheet(organizationId, dto.filters);
        break;
      case ReportType.PROFIT_AND_LOSS:
        data = await this.buildProfitAndLoss(organizationId, dto.filters);
        break;
      case ReportType.PAYABLES:
        data = await this.buildPayables(organizationId, dto.filters);
        break;
      case ReportType.RECEIVABLES:
        data = await this.buildReceivables(organizationId, dto.filters);
        break;
      case ReportType.VAT_CONTROL_ACCOUNT:
        data = await this.buildVatControlAccount(organizationId, dto.filters);
        break;
      default:
        data = {};
    }

    if (data && typeof data === 'object' && 'summary' in data) {
      summary = data.summary;
    }

    const record = this.reportsRepository.create({
      organization: { id: organizationId } as any,
      type: dto.type,
      filters: dto.filters ?? {},
      generatedBy: { id: userId } as any,
    });
    await this.reportsRepository.save(record);

    return { type: dto.type, generatedAt: new Date(), data, summary };
  }

  private async buildTrialBalance(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    let startDate = filters?.['startDate'];
    let endDate = filters?.['endDate'];

    if (!startDate || !endDate) {
      const taxSettings =
        await this.settingsService.getTaxSettings(organizationId);
      const taxYearEnd = taxSettings.taxYearEnd;

      if (taxYearEnd) {
        const [month, day] = taxYearEnd.split('-').map(Number);
        const now = new Date();
        const currentYear = now.getFullYear();
        const fiscalYearEnd = new Date(currentYear, month - 1, day);

        if (now > fiscalYearEnd) {
          const lastYearEnd = new Date(currentYear - 1, month - 1, day);
          const startDateObj = new Date(lastYearEnd);
          startDateObj.setDate(startDateObj.getDate() + 1);
          startDate = startDateObj.toISOString().split('T')[0];
          endDate = fiscalYearEnd.toISOString().split('T')[0];
        } else {
          const yearBeforeLastEnd = new Date(currentYear - 2, month - 1, day);
          const startDateObj = new Date(yearBeforeLastEnd);
          startDateObj.setDate(startDateObj.getDate() + 1);
          startDate = startDateObj.toISOString().split('T')[0];
          endDate = new Date(currentYear - 1, month - 1, day)
            .toISOString()
            .split('T')[0];
        }
      } else {
        startDate = new Date(new Date().getFullYear(), 0, 1)
          .toISOString()
          .split('T')[0];
        endDate = new Date().toISOString().split('T')[0];
      }
    }

    const accounts: Array<{
      accountName: string;
      accountType: string;
      debit: number;
      credit: number;
      balance: number;
    }> = [];

    const expenseQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .leftJoin('expense.category', 'category')
      .select([
        "COALESCE(category.name, 'Uncategorized Expenses') AS accountName",
        "'Expense' AS accountType",
        'SUM(COALESCE(expense.base_amount, expense.amount)) AS debit',
        '0 AS credit',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date >= :startDate', { startDate })
      .andWhere('expense.expense_date <= :endDate', { endDate })
      .andWhere("(expense.type IS NULL OR expense.type != 'credit')")
      .groupBy('category.name');

    if (filters?.['type']) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      expenseQuery.andWhere('expense.type IN (:...types)', { types });
    }

    const expenseRows = await expenseQuery.getRawMany();
    expenseRows.forEach((row) => {
      const debit = Number(row.debit || 0);
      if (debit > 0) {
        accounts.push({
          accountName: row.accountname || row.accountName,
          accountType: row.accounttype || row.accountType,
          debit,
          credit: 0,
          balance: debit,
        });
      }
    });

    const revenueQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        "'Sales Revenue' AS accountName",
        "'Revenue' AS accountType",
        '0 AS debit',
        'SUM(COALESCE(invoice.base_amount, invoice.amount)) AS credit',
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date >= :startDate', { startDate })
      .andWhere('invoice.invoice_date <= :endDate', { endDate });

    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      revenueQuery.andWhere('invoice.status IN (:...statuses)', { statuses });
    }

    const revenueRow = await revenueQuery.getRawOne();
    const revenueCredit = Number(revenueRow?.credit || 0);

    const creditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select([
        'SUM(COALESCE(creditNote.base_amount, creditNote.amount)) AS amount',
      ])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date >= :startDate', { startDate })
      .andWhere('creditNote.credit_note_date <= :endDate', { endDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      });

    const creditNotesRow = await creditNotesQuery.getRawOne();
    const creditNotesAmount = Number(creditNotesRow?.amount || 0);

    const debitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'SUM(COALESCE(debitNote.base_amount, debitNote.amount)) AS amount',
      ])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
      .andWhere('debitNote.debit_note_date <= :endDate', { endDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    const debitNotesRow = await debitNotesQuery.getRawOne();
    const debitNotesAmount = Number(debitNotesRow?.amount || 0);

    const revenueDebit = creditNotesAmount;
    const totalRevenueCredit = revenueCredit + debitNotesAmount;
    const revenueBalance = totalRevenueCredit - revenueDebit;

    accounts.push({
      accountName: 'Sales Revenue',
      accountType: 'Revenue',
      debit: revenueDebit,
      credit: totalRevenueCredit,
      balance: revenueBalance,
    });

    const accrualsAtEndQuery = this.accrualsRepository
      .createQueryBuilder('accrual')
      .select(['SUM(accrual.amount) AS credit'])
      .where('accrual.organization_id = :organizationId', { organizationId })
      .andWhere('accrual.is_deleted = false')
      .andWhere('accrual.status = :status', {
        status: AccrualStatus.PENDING_SETTLEMENT,
      })
      .andWhere('accrual.created_at::date <= :endDate', { endDate });

    const accrualsAtStartQuery = this.accrualsRepository
      .createQueryBuilder('accrual')
      .select(['SUM(accrual.amount) AS credit'])
      .where('accrual.organization_id = :organizationId', { organizationId })
      .andWhere('accrual.is_deleted = false')
      .andWhere('accrual.status = :status', {
        status: AccrualStatus.PENDING_SETTLEMENT,
      })
      .andWhere('accrual.created_at::date < :startDate', { startDate });

    const [accrualsAtEndRow, accrualsAtStartRow] = await Promise.all([
      accrualsAtEndQuery.getRawOne(),
      accrualsAtStartQuery.getRawOne(),
    ]);

    const accrualsAtEnd = Number(accrualsAtEndRow?.credit || 0);
    const accrualsAtStart = Number(accrualsAtStartRow?.credit || 0);
    const accrualsPeriodMovement = accrualsAtEnd - accrualsAtStart;

    const accrualsPeriodDebit =
      accrualsPeriodMovement < 0 ? Math.abs(accrualsPeriodMovement) : 0;
    const accrualsPeriodCredit =
      accrualsPeriodMovement > 0 ? accrualsPeriodMovement : 0;

    accounts.push({
      accountName: 'Accounts Payable',
      accountType: 'Liability',
      debit: accrualsPeriodDebit,
      credit: accrualsPeriodCredit,
      balance: accrualsPeriodCredit - accrualsPeriodDebit,
    });

    const creditNoteApplicationsSubqueryEnd =
      this.creditNoteApplicationsRepository
        .createQueryBuilder('cna')
        .select('COALESCE(SUM(cna.appliedAmount), 0)')
        .where('cna.invoice_id = invoice.id')
        .andWhere('cna.organization_id = :organizationId', { organizationId })
        .getQuery();

    const creditNoteApplicationsSubqueryStart =
      this.creditNoteApplicationsRepository
        .createQueryBuilder('cna')
        .select('COALESCE(SUM(cna.appliedAmount), 0)')
        .where('cna.invoice_id = invoice.id')
        .andWhere('cna.organization_id = :organizationId', { organizationId })
        .getQuery();

    const receivablesAtEndQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        `SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0) - (${creditNoteApplicationsSubqueryEnd})) AS invoiceAmount`,
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date <= :endDate', { endDate })
      .andWhere('invoice.payment_status IN (:...statuses)', {
        statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
      })
      .setParameter('organizationId', organizationId);

    const receivablesAtStartQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        `SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0) - (${creditNoteApplicationsSubqueryStart})) AS invoiceAmount`,
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date < :startDate', { startDate })
      .andWhere('invoice.payment_status IN (:...statuses)', {
        statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
      })
      .setParameter('organizationId', organizationId);

    const debitNotesAtEndQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select(['SUM(COALESCE(debitNote.total_amount, 0)) AS debit'])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date <= :endDate', { endDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    const debitNotesAtStartQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select(['SUM(COALESCE(debitNote.total_amount, 0)) AS debit'])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date < :startDate', { startDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    const [
      receivablesAtEndRow,
      receivablesAtStartRow,
      debitNotesAtEndRow,
      debitNotesAtStartRow,
    ] = await Promise.all([
      receivablesAtEndQuery.getRawOne(),
      receivablesAtStartQuery.getRawOne(),
      debitNotesAtEndQuery.getRawOne(),
      debitNotesAtStartQuery.getRawOne(),
    ]);

    const receivablesAtEnd = Number(receivablesAtEndRow?.invoiceAmount || 0);
    const receivablesAtStart = Number(
      receivablesAtStartRow?.invoiceAmount || 0,
    );
    const debitNotesAtEnd = Number(debitNotesAtEndRow?.debit || 0);
    const debitNotesAtStart = Number(debitNotesAtStartRow?.debit || 0);

    const arAtEnd = receivablesAtEnd + debitNotesAtEnd;
    const arAtStart = receivablesAtStart + debitNotesAtStart;
    const arPeriodMovement = arAtEnd - arAtStart;

    const arPeriodDebit = arPeriodMovement > 0 ? arPeriodMovement : 0;
    const arPeriodCredit =
      arPeriodMovement < 0 ? Math.abs(arPeriodMovement) : 0;
    const arPeriodBalance = arPeriodDebit - arPeriodCredit;

    accounts.push({
      accountName: 'Accounts Receivable',
      accountType: 'Asset',
      debit: arPeriodDebit,
      credit: arPeriodCredit,
      balance: arPeriodBalance,
    });

    const vatReceivableQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select([
        "'VAT Receivable (Input VAT)' AS accountName",
        "'Asset' AS accountType",
        'SUM(COALESCE(expense.vat_amount, 0)) AS debit',
        '0 AS credit',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date >= :startDate', { startDate })
      .andWhere('expense.expense_date <= :endDate', { endDate })
      .andWhere('expense.vat_amount > 0')
      .andWhere("(expense.type IS NULL OR expense.type != 'credit')");

    if (filters?.['type']) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      vatReceivableQuery.andWhere('expense.type IN (:...types)', { types });
    }

    const vatReceivableRow = await vatReceivableQuery.getRawOne();
    const vatReceivableDebit = Number(vatReceivableRow?.debit || 0);
    if (vatReceivableDebit > 0) {
      accounts.push({
        accountName: 'VAT Receivable (Input VAT)',
        accountType: 'Asset',
        debit: vatReceivableDebit,
        credit: 0,
        balance: vatReceivableDebit,
      });
    }

    const vatPayableQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        "'VAT Payable (Output VAT)' AS accountName",
        "'Liability' AS accountType",
        '0 AS debit',
        'SUM(COALESCE(invoice.vat_amount, 0)) AS credit',
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date >= :startDate', { startDate })
      .andWhere('invoice.invoice_date <= :endDate', { endDate })
      .andWhere('invoice.vat_amount > 0');

    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      vatPayableQuery.andWhere('invoice.status IN (:...statuses)', {
        statuses,
      });
    }

    const vatPayableRow = await vatPayableQuery.getRawOne();
    const vatPayableCredit = Number(vatPayableRow?.credit || 0);

    const vatCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select(['SUM(COALESCE(creditNote.vat_amount, 0)) AS debit'])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date >= :startDate', { startDate })
      .andWhere('creditNote.credit_note_date <= :endDate', { endDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      })
      .andWhere('creditNote.vat_amount > 0');

    const vatCreditNotesRow = await vatCreditNotesQuery.getRawOne();
    const vatCreditNotesDebit = Number(vatCreditNotesRow?.debit || 0);

    const vatDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select(['SUM(COALESCE(debitNote.vat_amount, 0)) AS credit'])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
      .andWhere('debitNote.debit_note_date <= :endDate', { endDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      })
      .andWhere('debitNote.vat_amount > 0');

    const vatDebitNotesRow = await vatDebitNotesQuery.getRawOne();
    const vatDebitNotesCredit = Number(vatDebitNotesRow?.credit || 0);

    const netVatPayableDebit = vatCreditNotesDebit;
    const netVatPayableCredit = vatPayableCredit + vatDebitNotesCredit;

    accounts.push({
      accountName: 'VAT Payable (Output VAT)',
      accountType: 'Liability',
      debit: netVatPayableDebit,
      credit: netVatPayableCredit,
      balance: netVatPayableCredit - netVatPayableDebit,
    });

    const openingExpensePaymentsQuery = this.expensePaymentsRepository
      .createQueryBuilder('payment')
      .select(['SUM(COALESCE(payment.amount, 0)) AS payments'])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date < :startDate', { startDate });

    const openingInvoicePaymentsQuery = this.invoicePaymentsRepository
      .createQueryBuilder('payment')
      .select(['SUM(COALESCE(payment.amount, 0)) AS receipts'])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date < :startDate', { startDate });

    const openingCashBankJournalEntriesQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select([
        "SUM(CASE WHEN entry.status IN ('cash_received', 'bank_received') THEN entry.amount ELSE 0 END) AS received",
        "SUM(CASE WHEN entry.status IN ('cash_paid', 'bank_paid') THEN entry.amount ELSE 0 END) AS paid",
      ])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date < :startDate', { startDate })
      .andWhere(
        "entry.status IN ('cash_paid', 'cash_received', 'bank_paid', 'bank_received')",
      );

    const periodExpensePaymentsQuery = this.expensePaymentsRepository
      .createQueryBuilder('payment')
      .select(['SUM(COALESCE(payment.amount, 0)) AS payments'])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date >= :startDate', { startDate })
      .andWhere('payment.payment_date <= :endDate', { endDate });

    const periodInvoicePaymentsQuery = this.invoicePaymentsRepository
      .createQueryBuilder('payment')
      .select(['SUM(COALESCE(payment.amount, 0)) AS receipts'])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date >= :startDate', { startDate })
      .andWhere('payment.payment_date <= :endDate', { endDate });

    const periodCashBankJournalEntriesQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select([
        "SUM(CASE WHEN entry.status IN ('cash_received', 'bank_received') THEN entry.amount ELSE 0 END) AS received",
        "SUM(CASE WHEN entry.status IN ('cash_paid', 'bank_paid') THEN entry.amount ELSE 0 END) AS paid",
      ])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date >= :startDate', { startDate })
      .andWhere('entry.entry_date <= :endDate', { endDate })
      .andWhere(
        "entry.status IN ('cash_paid', 'cash_received', 'bank_paid', 'bank_received')",
      );

    const [
      openingExpensePaymentsRow,
      openingInvoicePaymentsRow,
      openingCashBankJournalEntriesRow,
      periodExpensePaymentsRow,
      periodInvoicePaymentsRow,
      periodCashBankJournalEntriesRow,
    ] = await Promise.all([
      openingExpensePaymentsQuery.getRawOne(),
      openingInvoicePaymentsQuery.getRawOne(),
      openingCashBankJournalEntriesQuery.getRawOne(),
      periodExpensePaymentsQuery.getRawOne(),
      periodInvoicePaymentsQuery.getRawOne(),
      periodCashBankJournalEntriesQuery.getRawOne(),
    ]);

    const openingCashReceipts = Number(
      openingInvoicePaymentsRow?.receipts || 0,
    );
    const openingCashPayments = Number(
      openingExpensePaymentsRow?.payments || 0,
    );
    const openingJournalReceived = Number(
      openingCashBankJournalEntriesRow?.received || 0,
    );
    const openingJournalPaid = Number(
      openingCashBankJournalEntriesRow?.paid || 0,
    );
    const openingCashBalance =
      openingCashReceipts -
      openingCashPayments +
      openingJournalReceived -
      openingJournalPaid;

    const periodCashReceipts = Number(periodInvoicePaymentsRow?.receipts || 0);
    const periodCashPayments = Number(periodExpensePaymentsRow?.payments || 0);
    const periodJournalReceived = Number(
      periodCashBankJournalEntriesRow?.received || 0,
    );
    const periodJournalPaid = Number(
      periodCashBankJournalEntriesRow?.paid || 0,
    );
    const periodCashDebit = periodCashReceipts + periodJournalReceived;
    const periodCashCredit = periodCashPayments + periodJournalPaid;

    const closingCashBalance =
      openingCashBalance +
      periodCashReceipts -
      periodCashPayments +
      periodJournalReceived -
      periodJournalPaid;

    accounts.push({
      accountName: 'Cash/Bank',
      accountType: 'Asset',
      debit: periodCashDebit,
      credit: periodCashCredit,
      balance: closingCashBalance,
    });

    const journalEntriesQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select([
        "CASE WHEN entry.category = 'equity' THEN 'Equity - ' || entry.type::text WHEN entry.type = 'prepaid' THEN 'Prepaid Expenses' WHEN entry.type = 'accrued_income' THEN 'Accrued Income' WHEN entry.type = 'depreciation' THEN 'Depreciation' WHEN entry.type = 'outstanding' THEN 'Outstanding Liabilities' ELSE 'Other - ' || entry.category::text END AS accountName",
        "CASE WHEN entry.category = 'equity' THEN 'Equity' WHEN entry.type IN ('prepaid', 'accrued_income') THEN 'Asset' WHEN entry.type = 'depreciation' THEN 'Expense' WHEN entry.type = 'outstanding' THEN 'Liability' ELSE 'Journal Entry' END AS accountType",
        "SUM(CASE WHEN entry.type IN ('shareholder_account', 'prepaid', 'accrued_income', 'depreciation') THEN entry.amount ELSE 0 END) AS debit",
        "SUM(CASE WHEN entry.type IN ('share_capital', 'retained_earnings', 'outstanding') THEN entry.amount ELSE 0 END) AS credit",
      ])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date >= :startDate', { startDate })
      .andWhere('entry.entry_date <= :endDate', { endDate })
      .andWhere(
        "entry.status NOT IN ('cash_paid', 'cash_received', 'bank_paid', 'bank_received')",
      )
      .groupBy('entry.category')
      .addGroupBy('entry.type');

    const journalRows = await journalEntriesQuery.getRawMany();
    journalRows.forEach((row) => {
      const debit = Number(row.debit || 0);
      const credit = Number(row.credit || 0);
      if (debit > 0 || credit > 0) {
        const accountType = row.accounttype || 'Journal Entry';

        const isCreditAccount =
          accountType === 'Equity' ||
          accountType === 'Revenue' ||
          accountType === 'Liability';
        const balance = isCreditAccount ? credit - debit : debit - credit;

        accounts.push({
          accountName: row.accountname || 'Journal Entry',
          accountType: accountType,
          debit,
          credit,
          balance: balance,
        });
      }
    });

    const openingBalances = new Map<
      string,
      { debit: number; credit: number; balance: number }
    >();

    const openingExpenseQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .leftJoin('expense.category', 'category')
      .select([
        "COALESCE(category.name, 'Uncategorized Expenses') AS accountName",
        'SUM(COALESCE(expense.base_amount, expense.amount)) AS debit',
        '0 AS credit',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date < :startDate', { startDate })
      .andWhere("(expense.type IS NULL OR expense.type != 'credit')")
      .groupBy('category.name');

    if (filters?.['type']) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      openingExpenseQuery.andWhere('expense.type IN (:...types)', { types });
    }

    const openingExpenseRows = await openingExpenseQuery.getRawMany();
    openingExpenseRows.forEach((row) => {
      const debit = Number(row.debit || 0);
      if (debit > 0) {
        openingBalances.set(row.accountname || row.accountName, {
          debit,
          credit: 0,
          balance: debit,
        });
      }
    });

    const openingRevenueQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select(['SUM(COALESCE(invoice.base_amount, invoice.amount)) AS credit'])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date < :startDate', { startDate });

    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      openingRevenueQuery.andWhere('invoice.status IN (:...statuses)', {
        statuses,
      });
    }

    const openingRevenueRow = await openingRevenueQuery.getRawOne();
    const openingRevenueCredit = Number(openingRevenueRow?.credit || 0);

    const openingCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select([
        'SUM(COALESCE(creditNote.base_amount, creditNote.amount)) AS amount',
      ])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date < :startDate', { startDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      });

    const openingCreditNotesRow = await openingCreditNotesQuery.getRawOne();
    const openingCreditNotesAmount = Number(openingCreditNotesRow?.amount || 0);

    const openingDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'SUM(COALESCE(debitNote.base_amount, debitNote.amount)) AS amount',
      ])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date < :startDate', { startDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    const openingDebitNotesRow = await openingDebitNotesQuery.getRawOne();
    const openingDebitNotesAmount = Number(openingDebitNotesRow?.amount || 0);

    const openingRevenueDebit = openingCreditNotesAmount;
    const totalOpeningRevenueCredit =
      openingRevenueCredit + openingDebitNotesAmount;
    const openingRevenueBalance =
      totalOpeningRevenueCredit - openingRevenueDebit;

    openingBalances.set('Sales Revenue', {
      debit: openingRevenueDebit,
      credit: totalOpeningRevenueCredit,
      balance: openingRevenueBalance,
    });

    const openingAccrualsQuery = this.accrualsRepository
      .createQueryBuilder('accrual')
      .select(['SUM(accrual.amount) AS credit'])
      .where('accrual.organization_id = :organizationId', { organizationId })
      .andWhere('accrual.is_deleted = false')
      .andWhere('accrual.status = :status', {
        status: AccrualStatus.PENDING_SETTLEMENT,
      })
      .andWhere('accrual.created_at::date < :startDate', { startDate });

    const openingAccrualsRow = await openingAccrualsQuery.getRawOne();
    const openingAccrualsCredit = Number(openingAccrualsRow?.credit || 0);

    const openingAccrualsBalance = openingAccrualsCredit - 0;

    openingBalances.set('Accounts Payable', {
      debit: 0,
      credit: openingAccrualsCredit,
      balance: openingAccrualsBalance,
    });

    const openingCreditNoteApplicationsSubquery =
      this.creditNoteApplicationsRepository
        .createQueryBuilder('cna')
        .select('COALESCE(SUM(cna.appliedAmount), 0)')
        .where('cna.invoice_id = invoice.id')
        .andWhere('cna.organization_id = :organizationId', { organizationId })
        .getQuery();

    const openingReceivablesQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        `SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0) - (${openingCreditNoteApplicationsSubquery})) AS invoiceAmount`,
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date < :startDate', { startDate })
      .andWhere('invoice.payment_status IN (:...statuses)', {
        statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
      })
      .setParameter('organizationId', organizationId);

    const openingReceivablesRow = await openingReceivablesQuery.getRawOne();
    const openingReceivablesDebit = Number(
      openingReceivablesRow?.invoiceAmount || 0,
    );

    const openingReceivablesDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select(['SUM(COALESCE(debitNote.total_amount, 0)) AS debit'])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date < :startDate', { startDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    const openingReceivablesDebitNotesRow =
      await openingReceivablesDebitNotesQuery.getRawOne();
    const openingReceivablesDebitNotesDebit = Number(
      openingReceivablesDebitNotesRow?.debit || 0,
    );

    const netOpeningReceivablesDebit =
      openingReceivablesDebit + openingReceivablesDebitNotesDebit;
    const netOpeningReceivablesCredit = 0;

    openingBalances.set('Accounts Receivable', {
      debit: netOpeningReceivablesDebit,
      credit: netOpeningReceivablesCredit,
      balance: netOpeningReceivablesDebit - netOpeningReceivablesCredit,
    });

    const openingVatReceivableQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select([
        "'VAT Receivable (Input VAT)' AS accountName",
        'SUM(COALESCE(expense.vat_amount, 0)) AS debit',
        '0 AS credit',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date < :startDate', { startDate })
      .andWhere('expense.vat_amount > 0')
      .andWhere("(expense.type IS NULL OR expense.type != 'credit')");

    if (filters?.['type']) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      openingVatReceivableQuery.andWhere('expense.type IN (:...types)', {
        types,
      });
    }

    const openingVatReceivableRow = await openingVatReceivableQuery.getRawOne();
    const openingVatReceivableDebit = Number(
      openingVatReceivableRow?.debit || 0,
    );
    if (openingVatReceivableDebit > 0) {
      openingBalances.set('VAT Receivable (Input VAT)', {
        debit: openingVatReceivableDebit,
        credit: 0,
        balance: openingVatReceivableDebit,
      });
    }

    const openingVatPayableQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select(['SUM(COALESCE(invoice.vat_amount, 0)) AS credit'])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date < :startDate', { startDate })
      .andWhere('invoice.vat_amount > 0');

    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      openingVatPayableQuery.andWhere('invoice.status IN (:...statuses)', {
        statuses,
      });
    }

    const openingVatPayableRow = await openingVatPayableQuery.getRawOne();
    const openingVatPayableCredit = Number(openingVatPayableRow?.credit || 0);

    const openingVatCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select(['SUM(COALESCE(creditNote.vat_amount, 0)) AS debit'])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date < :startDate', { startDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      })
      .andWhere('creditNote.vat_amount > 0');

    const openingVatCreditNotesRow =
      await openingVatCreditNotesQuery.getRawOne();
    const openingVatCreditNotesDebit = Number(
      openingVatCreditNotesRow?.debit || 0,
    );

    const openingVatDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select(['SUM(COALESCE(debitNote.vat_amount, 0)) AS credit'])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date < :startDate', { startDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      })
      .andWhere('debitNote.vat_amount > 0');

    const openingVatDebitNotesRow = await openingVatDebitNotesQuery.getRawOne();
    const openingVatDebitNotesCredit = Number(
      openingVatDebitNotesRow?.credit || 0,
    );

    const netOpeningVatPayableDebit = openingVatCreditNotesDebit;
    const netOpeningVatPayableCredit =
      openingVatPayableCredit + openingVatDebitNotesCredit;

    openingBalances.set('VAT Payable (Output VAT)', {
      debit: netOpeningVatPayableDebit,
      credit: netOpeningVatPayableCredit,
      balance: netOpeningVatPayableCredit - netOpeningVatPayableDebit,
    });

    const totalOpeningCashDebit = openingCashReceipts + openingJournalReceived;
    const totalOpeningCashCredit = openingCashPayments + openingJournalPaid;

    openingBalances.set('Cash/Bank', {
      debit: totalOpeningCashDebit,
      credit: totalOpeningCashCredit,
      balance: openingCashBalance,
    });

    const openingJournalQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select([
        "CASE WHEN entry.category = 'equity' THEN 'Equity - ' || entry.type::text WHEN entry.type = 'prepaid' THEN 'Prepaid Expenses' WHEN entry.type = 'accrued_income' THEN 'Accrued Income' WHEN entry.type = 'depreciation' THEN 'Depreciation' WHEN entry.type = 'outstanding' THEN 'Outstanding Liabilities' ELSE 'Other - ' || entry.category::text END AS accountName",
        "SUM(CASE WHEN entry.type IN ('shareholder_account', 'prepaid', 'accrued_income', 'depreciation') THEN entry.amount ELSE 0 END) AS debit",
        "SUM(CASE WHEN entry.type IN ('share_capital', 'retained_earnings', 'outstanding') THEN entry.amount ELSE 0 END) AS credit",
      ])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date < :startDate', { startDate })
      .andWhere(
        "entry.status NOT IN ('cash_paid', 'cash_received', 'bank_paid', 'bank_received')",
      )
      .groupBy('entry.category')
      .addGroupBy('entry.type');

    const openingJournalRows = await openingJournalQuery.getRawMany();
    openingJournalRows.forEach((row) => {
      const debit = Number(row.debit || 0);
      const credit = Number(row.credit || 0);
      if (debit > 0 || credit > 0) {
        const accountName = row.accountname || row.accountName;

        const isEquityAccount = accountName.includes('Equity');

        const balance = isEquityAccount ? credit - debit : debit - credit;
        openingBalances.set(accountName, {
          debit,
          credit,
          balance: balance,
        });
      }
    });

    let totalOpeningDebit = 0;
    let totalOpeningCredit = 0;
    openingBalances.forEach((balance) => {
      totalOpeningDebit += balance.debit;
      totalOpeningCredit += balance.credit;
    });

    const totalDebit = accounts.reduce((sum, acc) => sum + acc.debit, 0);
    const totalCredit = accounts.reduce((sum, acc) => sum + acc.credit, 0);

    const totalClosingDebit = totalOpeningDebit + totalDebit;
    const totalClosingCredit = totalOpeningCredit + totalCredit;
    const totalOpeningBalance = totalOpeningDebit - totalOpeningCredit;
    const totalClosingBalance = totalClosingDebit - totalClosingCredit;

    const retainedEarningsRevenueCredit = accounts
      .filter((acc) => acc.accountName === 'Sales Revenue')
      .reduce((sum, acc) => sum + acc.credit, 0);
    const retainedEarningsRevenueDebit = accounts
      .filter((acc) => acc.accountName === 'Sales Revenue')
      .reduce((sum, acc) => sum + acc.debit, 0);
    const retainedEarningsNetRevenue =
      retainedEarningsRevenueCredit - retainedEarningsRevenueDebit;

    const totalExpensesDebit = accounts
      .filter((acc) => acc.accountType === 'Expense')
      .reduce((sum, acc) => sum + acc.debit, 0);

    const equityJournalCredit = accounts
      .filter((acc) => acc.accountName.includes('Equity'))
      .reduce((sum, acc) => {
        if (
          acc.accountName.includes('share_capital') ||
          acc.accountName.includes('retained_earnings')
        ) {
          return sum + acc.credit;
        }
        return sum;
      }, 0);
    const equityJournalDebit = accounts
      .filter((acc) => acc.accountName.includes('Equity'))
      .reduce((sum, acc) => {
        if (acc.accountName.includes('shareholder_account')) {
          return sum + acc.debit;
        }
        return sum;
      }, 0);
    const netEquityJournal = equityJournalCredit - equityJournalDebit;

    const retainedEarningsBalance =
      retainedEarningsNetRevenue - totalExpensesDebit + netEquityJournal;

    accounts.push({
      accountName: 'Retained Earnings / Current Year Profit',
      accountType: 'Equity',
      debit:
        retainedEarningsBalance < 0 ? Math.abs(retainedEarningsBalance) : 0,
      credit: retainedEarningsBalance > 0 ? retainedEarningsBalance : 0,
      balance: retainedEarningsBalance,
    });

    const calculatedRetainedEarnings = totalClosingBalance;
    const accountingDifference =
      calculatedRetainedEarnings - retainedEarningsBalance;

    const finalTotalDebit = accounts.reduce((sum, acc) => sum + acc.debit, 0);
    const finalTotalCredit = accounts.reduce((sum, acc) => sum + acc.credit, 0);

    const periodDifference = Math.abs(totalDebit - totalCredit);
    const closingDifference = Math.abs(finalTotalDebit - finalTotalCredit);
    const isBalanced = periodDifference < 0.01 && closingDifference < 0.01;

    const accountNamesSet = new Set(accounts.map((acc) => acc.accountName));
    openingBalances.forEach((opening, accountName) => {
      if (
        !accountNamesSet.has(accountName) &&
        (opening.debit > 0 || opening.credit > 0 || opening.balance !== 0)
      ) {
        let accountType = 'Asset';
        if (
          accountName === 'Accounts Payable' ||
          accountName.includes('VAT Payable')
        ) {
          accountType = 'Liability';
        } else if (accountName === 'Sales Revenue') {
          accountType = 'Revenue';
        } else if (accountName.includes('Equity')) {
          accountType = 'Equity';
        }

        accounts.push({
          accountName,
          accountType,
          debit: 0,
          credit: 0,
          balance: 0,
        });
      }
    });

    const accountsWithBalances = accounts.map((acc) => {
      const opening = openingBalances.get(acc.accountName) || {
        debit: 0,
        credit: 0,
        balance: 0,
      };
      const closingDebit = opening.debit + acc.debit;
      const closingCredit = opening.credit + acc.credit;

      const isCreditAccount =
        acc.accountType === 'Liability' ||
        acc.accountType === 'Revenue' ||
        acc.accountType === 'Equity';
      const closingBalance = isCreditAccount
        ? closingCredit - closingDebit
        : closingDebit - closingCredit;

      return {
        ...acc,
        openingDebit: opening.debit,
        openingCredit: opening.credit,
        openingBalance: opening.balance,
        closingDebit: closingDebit,
        closingCredit: closingCredit,
        closingBalance: closingBalance,
      };
    });

    return {
      period: {
        startDate,
        endDate,
      },
      accounts: accountsWithBalances.sort((a, b) => {
        const typeOrder = [
          'Asset',
          'Liability',
          'Expense',
          'Revenue',
          'Journal Entry',
          'Equity',
        ];
        const aTypeIndex = typeOrder.indexOf(a.accountType);
        const bTypeIndex = typeOrder.indexOf(b.accountType);
        const aOrder = aTypeIndex >= 0 ? aTypeIndex : 999;
        const bOrder = bTypeIndex >= 0 ? bTypeIndex : 999;
        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }
        return a.accountName.localeCompare(b.accountName);
      }),
      summary: {
        openingDebit: Number(totalOpeningDebit.toFixed(2)),
        openingCredit: Number(totalOpeningCredit.toFixed(2)),
        openingBalance: Number(totalOpeningBalance.toFixed(2)),
        periodDebit: Number(totalDebit.toFixed(2)),
        periodCredit: Number(totalCredit.toFixed(2)),
        periodBalance: Number((totalDebit - totalCredit).toFixed(2)),
        closingDebit: Number(totalClosingDebit.toFixed(2)),
        closingCredit: Number(totalClosingCredit.toFixed(2)),
        closingBalance: Number(totalClosingBalance.toFixed(2)),

        totalDebit: Number(totalDebit.toFixed(2)),
        totalCredit: Number(totalCredit.toFixed(2)),
        totalBalance: Number((totalDebit - totalCredit).toFixed(2)),
        accountCount: accounts.length,

        retainedEarnings: Number(retainedEarningsBalance.toFixed(2)),
        netRevenue: Number(retainedEarningsNetRevenue.toFixed(2)),
        totalExpenses: Number(totalExpensesDebit.toFixed(2)),
        netEquityJournal: Number(netEquityJournal.toFixed(2)),

        accountingDifference: Number(accountingDifference.toFixed(2)),

        isBalanced: isBalanced,
        periodDifference: Number(periodDifference.toFixed(2)),
        closingDifference: Number(closingDifference.toFixed(2)),
        warning: !isBalanced
          ? `Trial balance is not balanced! Period difference: ${periodDifference.toFixed(2)}, Closing difference: ${closingDifference.toFixed(2)}. Accounting difference: ${accountingDifference.toFixed(2)}. This indicates an accounting error that needs investigation.`
          : Math.abs(accountingDifference) > 0.01
            ? `Accounting difference detected: ${accountingDifference.toFixed(2)}. This may indicate missing accounts or calculation errors.`
            : null,
      },
    };
  }

  private async buildBalanceSheet(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    const asOfDate =
      filters?.['endDate'] || new Date().toISOString().split('T')[0];
    const startDate =
      filters?.['startDate'] ||
      new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];

    const assets: Array<{ category: string; amount: number }> = [];
    let totalAssets = 0;

    const creditNoteApplicationsSubquery = this.creditNoteApplicationsRepository
      .createQueryBuilder('cna')
      .select('COALESCE(SUM(cna.appliedAmount), 0)')
      .where('cna.invoice_id = invoice.id')
      .andWhere('cna.organization_id = :organizationId', { organizationId })
      .getQuery();

    const receivablesQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        "'Accounts Receivable' AS category",
        `SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0) - (${creditNoteApplicationsSubquery})) AS amount`,
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date <= :asOfDate', { asOfDate })
      .andWhere('invoice.payment_status IN (:...statuses)', {
        statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
      })
      .setParameter('organizationId', organizationId);

    const receivablesDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select(['SUM(COALESCE(debitNote.total_amount, 0)) AS debit'])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date <= :asOfDate', { asOfDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    const [receivablesRow, receivablesDebitNotesRow] = await Promise.all([
      receivablesQuery.getRawOne(),
      receivablesDebitNotesQuery.getRawOne(),
    ]);

    const receivablesAmount = Number(receivablesRow?.amount || 0);
    const receivablesDebitNotes = Number(receivablesDebitNotesRow?.debit || 0);

    const netReceivablesAmount = receivablesAmount + receivablesDebitNotes;
    if (netReceivablesAmount > 0) {
      assets.push({
        category: 'Accounts Receivable',
        amount: netReceivablesAmount,
      });
      totalAssets += netReceivablesAmount;
    }

    const invoicePaymentsQuery = this.invoicePaymentsRepository
      .createQueryBuilder('payment')
      .select(['SUM(COALESCE(payment.amount, 0)) AS receipts'])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date <= :asOfDate', { asOfDate });

    const expensePaymentsQuery = this.expensePaymentsRepository
      .createQueryBuilder('payment')
      .select(['SUM(COALESCE(payment.amount, 0)) AS payments'])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date <= :asOfDate', { asOfDate });

    const cashBankJournalEntriesQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select([
        "SUM(CASE WHEN entry.status IN ('cash_received', 'bank_received') THEN entry.amount ELSE 0 END) AS received",
        "SUM(CASE WHEN entry.status IN ('cash_paid', 'bank_paid') THEN entry.amount ELSE 0 END) AS paid",
      ])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date <= :asOfDate', { asOfDate })
      .andWhere(
        "entry.status IN ('cash_paid', 'cash_received', 'bank_paid', 'bank_received')",
      );

    const [invoicePaymentsRow, expensePaymentsRow, cashBankJournalEntriesRow] =
      await Promise.all([
        invoicePaymentsQuery.getRawOne(),
        expensePaymentsQuery.getRawOne(),
        cashBankJournalEntriesQuery.getRawOne(),
      ]);

    const totalReceipts = Number(invoicePaymentsRow?.receipts || 0);
    const totalPayments = Number(expensePaymentsRow?.payments || 0);
    const totalJournalReceived = Number(
      cashBankJournalEntriesRow?.received || 0,
    );
    const totalJournalPaid = Number(cashBankJournalEntriesRow?.paid || 0);
    const netCash =
      totalReceipts - totalPayments + totalJournalReceived - totalJournalPaid;

    const vatReceivableQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select([
        "'VAT Receivable (Input VAT)' AS category",
        'SUM(COALESCE(expense.vat_amount, 0)) AS amount',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date <= :asOfDate', { asOfDate })
      .andWhere('expense.vat_amount > 0')
      .andWhere("(expense.type IS NULL OR expense.type != 'credit')");

    if (filters?.['type']) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      vatReceivableQuery.andWhere('expense.type IN (:...types)', { types });
    }

    const vatReceivableRow = await vatReceivableQuery.getRawOne();
    const vatReceivableAmount = Number(vatReceivableRow?.amount || 0);
    if (vatReceivableAmount > 0) {
      assets.push({
        category: 'VAT Receivable (Input VAT)',
        amount: vatReceivableAmount,
      });
      totalAssets += vatReceivableAmount;
    }

    const liabilities: Array<{
      vendor: string;
      amount: number;
      status: string;
      category?: string;
    }> = [];
    let totalLiabilities = 0;

    // Calculate Accounts Payable based on unpaid expenses linked to accruals
    // Instead of using accrual status, we check if the expense has been fully paid
    const expensePaymentsSubquery = this.expensePaymentsRepository
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount), 0)')
      .where('payment.expense_id = expense.id')
      .andWhere('payment.payment_date <= :asOfDate')
      .andWhere('payment.organization_id = :organizationId')
      .getQuery();

    const accrualsQuery = this.accrualsRepository
      .createQueryBuilder('accrual')
      .leftJoin('accrual.expense', 'expense')
      .select([
        'accrual.vendor_name AS vendor',
        'expense.id AS expenseId',
        'expense.total_amount AS expenseTotalAmount',
        `(${expensePaymentsSubquery}) AS paidAmount`,
      ])
      .where('accrual.organization_id = :organizationId', { organizationId })
      .andWhere('accrual.is_deleted = false')
      .andWhere('expense.is_deleted = false')
      .andWhere('accrual.created_at::date <= :asOfDate', { asOfDate })
      .setParameter('organizationId', organizationId)
      .setParameter('asOfDate', asOfDate);

    const accrualsRows = await accrualsQuery.getRawMany();

    // Group by vendor and calculate outstanding amounts
    const vendorPayables = new Map<string, number>();

    accrualsRows.forEach((row) => {
      const expenseTotal = Number(
        row.expenseTotalAmount || row.expensetotalamount || 0,
      );
      const paidAmount = Number(row.paidAmount || row.paidamount || 0);
      const outstanding = expenseTotal - paidAmount;

      if (outstanding > 0) {
        const vendor = row.vendor || 'N/A';
        const currentAmount = vendorPayables.get(vendor) || 0;
        vendorPayables.set(vendor, currentAmount + outstanding);
      }
    });

    // Add to liabilities
    vendorPayables.forEach((amount, vendor) => {
      if (amount > 0) {
        liabilities.push({
          vendor,
          amount,
          status: 'Unpaid',
          category: 'Accounts Payable',
        });
        totalLiabilities += amount;
      }
    });

    const vatPayableQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        "'VAT Payable (Output VAT)' AS category",
        'SUM(COALESCE(invoice.vat_amount, 0)) AS amount',
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date <= :asOfDate', { asOfDate })
      .andWhere('invoice.vat_amount > 0');

    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      vatPayableQuery.andWhere('invoice.status IN (:...statuses)', {
        statuses,
      });
    }

    const vatCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select(['SUM(COALESCE(creditNote.vat_amount, 0)) AS vat'])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date <= :asOfDate', { asOfDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      })
      .andWhere('creditNote.vat_amount > 0');

    const vatDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select(['SUM(COALESCE(debitNote.vat_amount, 0)) AS vat'])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date <= :asOfDate', { asOfDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      })
      .andWhere('debitNote.vat_amount > 0');

    const [vatPayableRow, vatCreditNotesRow, vatDebitNotesRow] =
      await Promise.all([
        vatPayableQuery.getRawOne(),
        vatCreditNotesQuery.getRawOne(),
        vatDebitNotesQuery.getRawOne(),
      ]);

    const vatPayableAmount = Number(vatPayableRow?.amount || 0);
    const vatCreditNotesAmount = Number(vatCreditNotesRow?.vat || 0);
    const vatDebitNotesAmount = Number(vatDebitNotesRow?.vat || 0);

    const netVatPayableAmount =
      vatPayableAmount - vatCreditNotesAmount + vatDebitNotesAmount;
    if (netVatPayableAmount > 0) {
      liabilities.push({
        vendor: 'VAT Payable (Output VAT)',
        amount: netVatPayableAmount,
        status: 'Liability',
      });
      totalLiabilities += netVatPayableAmount;
    }

    const revenueQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select(['SUM(COALESCE(invoice.base_amount, invoice.amount)) AS revenue'])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date <= :asOfDate', { asOfDate });

    const creditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select([
        'SUM(COALESCE(creditNote.base_amount, creditNote.amount)) AS creditNotes',
      ])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date <= :asOfDate', { asOfDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      });

    const debitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'SUM(COALESCE(debitNote.base_amount, debitNote.amount)) AS debitNotes',
      ])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date <= :asOfDate', { asOfDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    const journalEntriesQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select(['entry.type AS type', 'SUM(entry.amount) AS amount'])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date <= :asOfDate', { asOfDate })
      .andWhere(
        "entry.status NOT IN ('cash_paid', 'cash_received', 'bank_paid', 'bank_received')",
      )
      .groupBy('entry.type');

    const [revenueRow, creditNotesRow, debitNotesRow, journalRows] =
      await Promise.all([
        revenueQuery.getRawOne(),
        creditNotesQuery.getRawOne(),
        debitNotesQuery.getRawOne(),
        journalEntriesQuery.getRawMany(),
      ]);

    const totalRevenue = Number(revenueRow?.revenue || 0);
    const creditNotesAmount = Number(creditNotesRow?.creditNotes || 0);
    const debitNotesAmount = Number(debitNotesRow?.debitNotes || 0);

    const journalEquityMap = new Map<string, number>();
    let journalEquity = 0;
    let journalShareholder = 0;
    let journalPrepaid = 0;
    let journalAccruedIncome = 0;
    let journalDepreciation = 0;
    let journalOutstanding = 0;

    journalRows.forEach((row) => {
      const amount = Number(row.amount || 0);
      const type = row.type;
      journalEquityMap.set(type, amount);

      if (type === 'share_capital' || type === 'retained_earnings') {
        journalEquity += amount;
      } else if (type === 'shareholder_account') {
        journalShareholder += amount;
      } else if (type === 'prepaid') {
        journalPrepaid += amount;
      } else if (type === 'accrued_income') {
        journalAccruedIncome += amount;
      } else if (type === 'depreciation') {
        journalDepreciation += amount;
      } else if (type === 'outstanding') {
        journalOutstanding += amount;
      }
    });

    const netRevenue = totalRevenue - creditNotesAmount + debitNotesAmount;

    const expensesQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select(['SUM(COALESCE(expense.base_amount, expense.amount)) AS amount'])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date <= :asOfDate', { asOfDate })
      .andWhere("(expense.type IS NULL OR expense.type != 'credit')");

    if (filters?.['type']) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      expensesQuery.andWhere('expense.type IN (:...types)', { types });
    }

    const expensesRow = await expensesQuery.getRawOne();
    const totalExpenses = Number(expensesRow?.amount || 0);

    if (journalPrepaid > 0) {
      assets.push({
        category: 'Prepaid Expenses',
        amount: journalPrepaid,
      });
      totalAssets += journalPrepaid;
    }
    if (journalAccruedIncome > 0) {
      assets.push({
        category: 'Accrued Income',
        amount: journalAccruedIncome,
      });
      totalAssets += journalAccruedIncome;
    }

    const totalEquity =
      netRevenue -
      totalExpenses -
      journalDepreciation +
      journalEquity -
      journalShareholder -
      journalOutstanding;

    const openingExpensesQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select(['SUM(COALESCE(expense.base_amount, expense.amount)) AS amount'])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date < :startDate', { startDate })
      .andWhere("(expense.type IS NULL OR expense.type != 'credit')");

    const openingCreditNoteApplicationsSubquery =
      this.creditNoteApplicationsRepository
        .createQueryBuilder('cna')
        .select('COALESCE(SUM(cna.appliedAmount), 0)')
        .where('cna.invoice_id = invoice.id')
        .andWhere('cna.organization_id = :organizationId', { organizationId })
        .getQuery();

    const openingReceivablesQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        `SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0) - (${openingCreditNoteApplicationsSubquery})) AS amount`,
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date < :startDate', { startDate })
      .andWhere('invoice.payment_status IN (:...statuses)', {
        statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
      })
      .setParameter('organizationId', organizationId);

    const openingReceivablesDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select(['SUM(COALESCE(debitNote.total_amount, 0)) AS debit'])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date < :startDate', { startDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    const openingCashQuery = this.invoicePaymentsRepository
      .createQueryBuilder('payment')
      .select(['SUM(COALESCE(payment.amount, 0)) AS receipts'])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date < :startDate', { startDate });

    const openingExpensePaymentsQuery = this.expensePaymentsRepository
      .createQueryBuilder('payment')
      .select(['SUM(COALESCE(payment.amount, 0)) AS payments'])
      .where('payment.organization_id = :organizationId', { organizationId })
      .andWhere('payment.payment_date < :startDate', { startDate });

    const openingCashBankJournalEntriesQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select([
        "SUM(CASE WHEN entry.status IN ('cash_received', 'bank_received') THEN entry.amount ELSE 0 END) AS received",
        "SUM(CASE WHEN entry.status IN ('cash_paid', 'bank_paid') THEN entry.amount ELSE 0 END) AS paid",
      ])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date < :startDate', { startDate })
      .andWhere(
        "entry.status IN ('cash_paid', 'cash_received', 'bank_paid', 'bank_received')",
      );

    const openingVatReceivableQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select(['SUM(COALESCE(expense.vat_amount, 0)) AS amount'])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date < :startDate', { startDate })
      .andWhere('expense.vat_amount > 0')
      .andWhere("(expense.type IS NULL OR expense.type != 'credit')");

    const openingAccrualsQuery = this.accrualsRepository
      .createQueryBuilder('accrual')
      .select(['SUM(accrual.amount) AS amount'])
      .where('accrual.organization_id = :organizationId', { organizationId })
      .andWhere('accrual.is_deleted = false')
      .andWhere('accrual.status = :status', {
        status: AccrualStatus.PENDING_SETTLEMENT,
      })
      .andWhere('accrual.created_at::date < :startDate', { startDate });

    const openingVatPayableQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select(['SUM(COALESCE(invoice.vat_amount, 0)) AS amount'])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date < :startDate', { startDate })
      .andWhere('invoice.vat_amount > 0');

    const openingRevenueQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select(['SUM(COALESCE(invoice.base_amount, invoice.amount)) AS revenue'])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date < :startDate', { startDate });

    const openingCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select([
        'SUM(COALESCE(creditNote.base_amount, creditNote.amount)) AS credit',
      ])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date < :startDate', { startDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      });

    const openingDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'SUM(COALESCE(debitNote.base_amount, debitNote.amount)) AS debit',
      ])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date < :startDate', { startDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    const openingJournalQuery = this.journalEntriesRepository
      .createQueryBuilder('entry')
      .select(['entry.type AS type', 'SUM(entry.amount) AS amount'])
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.entry_date < :startDate', { startDate })
      .andWhere(
        "entry.status NOT IN ('cash_paid', 'cash_received', 'bank_paid', 'bank_received')",
      )
      .groupBy('entry.type');

    const [
      openingExpensesRow,
      openingReceivablesRow,
      openingReceivablesDebitNotesRow,
      openingCashRow,
      openingExpensePaymentsRow,
      openingVatReceivableRow,
      openingAccrualsRow,
      openingVatPayableRow,
      openingRevenueRow,
      openingCreditNotesRow,
      openingDebitNotesRow,
      openingJournalRows,
      openingCashBankJournalEntriesRow,
    ] = await Promise.all([
      openingExpensesQuery.getRawOne(),
      openingReceivablesQuery.getRawOne(),
      openingReceivablesDebitNotesQuery.getRawOne(),
      openingCashQuery.getRawOne(),
      openingExpensePaymentsQuery.getRawOne(),
      openingVatReceivableQuery.getRawOne(),
      openingAccrualsQuery.getRawOne(),
      openingVatPayableQuery.getRawOne(),
      openingRevenueQuery.getRawOne(),
      openingCreditNotesQuery.getRawOne(),
      openingDebitNotesQuery.getRawOne(),
      openingJournalQuery.getRawMany(),
      openingCashBankJournalEntriesQuery.getRawOne(),
    ]);

    const openingExpenses = Number(openingExpensesRow?.amount || 0);
    const openingReceivablesAmount = Number(openingReceivablesRow?.amount || 0);
    const openingReceivablesDebitNotes = Number(
      openingReceivablesDebitNotesRow?.debit || 0,
    );

    const openingReceivables =
      openingReceivablesAmount + openingReceivablesDebitNotes;
    const openingCashReceipts = Number(openingCashRow?.receipts || 0);
    const openingCashPayments = Number(
      openingExpensePaymentsRow?.payments || 0,
    );
    const openingJournalReceived = Number(
      openingCashBankJournalEntriesRow?.received || 0,
    );
    const openingJournalPaid = Number(
      openingCashBankJournalEntriesRow?.paid || 0,
    );
    const openingCash =
      openingCashReceipts -
      openingCashPayments +
      openingJournalReceived -
      openingJournalPaid;
    const openingVatReceivable = Number(openingVatReceivableRow?.amount || 0);

    if (netCash > 0) {
      const cashAssetIndex = assets.findIndex(
        (a) => a.category === 'Cash/Bank',
      );
      if (cashAssetIndex >= 0) {
        const oldCashAmount = assets[cashAssetIndex].amount;
        totalAssets = totalAssets - oldCashAmount + netCash;
        assets[cashAssetIndex].amount = netCash;
      } else {
        assets.push({
          category: 'Cash/Bank',
          amount: netCash,
        });
        totalAssets += netCash;
      }
    } else if (netCash < 0) {
      const overdraftIndex = liabilities.findIndex(
        (l) => l.vendor === 'Bank Overdraft',
      );
      if (overdraftIndex >= 0) {
        const oldOverdraftAmount = liabilities[overdraftIndex].amount;
        totalLiabilities =
          totalLiabilities - oldOverdraftAmount + Math.abs(netCash);
        liabilities[overdraftIndex].amount = Math.abs(netCash);
      } else {
        liabilities.push({
          vendor: 'Bank Overdraft',
          amount: Math.abs(netCash),
          status: 'Liability',
        });
        totalLiabilities += Math.abs(netCash);
      }
    }

    const openingAssetsBase =
      openingReceivables + openingCash + openingVatReceivable;

    const openingAccruals = Number(openingAccrualsRow?.amount || 0);
    const openingVatPayable = Number(openingVatPayableRow?.amount || 0);

    const openingRevenue = Number(openingRevenueRow?.revenue || 0);
    const openingCreditNotes = Number(openingCreditNotesRow?.credit || 0);
    const openingDebitNotes = Number(openingDebitNotesRow?.debit || 0);
    const openingNetRevenue =
      openingRevenue - openingCreditNotes + openingDebitNotes;

    const openingJournalEquityMap = new Map<string, number>();
    let openingJournalEquity = 0;
    let openingJournalShareholder = 0;
    let openingJournalPrepaid = 0;
    let openingJournalAccruedIncome = 0;
    let openingJournalDepreciation = 0;
    let openingJournalOutstanding = 0;

    openingJournalRows.forEach((row) => {
      const amount = Number(row.amount || 0);
      const type = row.type;
      openingJournalEquityMap.set(type, amount);

      if (type === 'share_capital' || type === 'retained_earnings') {
        openingJournalEquity += amount;
      } else if (type === 'shareholder_account') {
        openingJournalShareholder += amount;
      } else if (type === 'prepaid') {
        openingJournalPrepaid += amount;
      } else if (type === 'accrued_income') {
        openingJournalAccruedIncome += amount;
      } else if (type === 'depreciation') {
        openingJournalDepreciation += amount;
      } else if (type === 'outstanding') {
        openingJournalOutstanding += amount;
      }
    });

    const openingAssets =
      openingAssetsBase + openingJournalPrepaid + openingJournalAccruedIncome;

    const openingVatCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select(['SUM(COALESCE(creditNote.vat_amount, 0)) AS vat'])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date < :startDate', { startDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      })
      .andWhere('creditNote.vat_amount > 0');
    const openingVatDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select(['SUM(COALESCE(debitNote.vat_amount, 0)) AS vat'])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date < :startDate', { startDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      })
      .andWhere('debitNote.vat_amount > 0');
    const [openingVatCreditNotesRow, openingVatDebitNotesRow] =
      await Promise.all([
        openingVatCreditNotesQuery.getRawOne(),
        openingVatDebitNotesQuery.getRawOne(),
      ]);
    const openingVatCreditNotes = Number(openingVatCreditNotesRow?.vat || 0);
    const openingVatDebitNotes = Number(openingVatDebitNotesRow?.vat || 0);
    const openingNetVatPayable =
      openingVatPayable - openingVatCreditNotes + openingVatDebitNotes;
    const openingLiabilities =
      openingAccruals + openingNetVatPayable + openingJournalOutstanding;

    const openingEquity =
      openingNetRevenue -
      openingExpenses -
      openingJournalDepreciation +
      openingJournalEquity -
      openingJournalShareholder -
      openingJournalOutstanding;

    const closingAssets = openingAssets + totalAssets;
    const closingLiabilities = openingLiabilities + totalLiabilities;
    const closingEquity = openingEquity + totalEquity;

    const equityItems: Array<{
      account: string;
      opening: number;
      period: number;
      closing: number;
    }> = [];

    const openingShareCapital = Number(
      openingJournalEquityMap.get('share_capital') || 0,
    );
    const periodShareCapital = Number(
      journalEquityMap.get('share_capital') || 0,
    );
    const closingShareCapital = openingShareCapital + periodShareCapital;
    equityItems.push({
      account: 'Share Capital',
      opening: Number(openingShareCapital.toFixed(2)),
      period: Number(periodShareCapital.toFixed(2)),
      closing: Number(closingShareCapital.toFixed(2)),
    });

    const openingRetainedEarningsJournal = Number(
      openingJournalEquityMap.get('retained_earnings') || 0,
    );
    const periodRetainedEarningsJournal = Number(
      journalEquityMap.get('retained_earnings') || 0,
    );
    const openingRetainedEarnings =
      openingNetRevenue - openingExpenses + openingRetainedEarningsJournal;
    const periodRetainedEarnings =
      netRevenue - totalExpenses + periodRetainedEarningsJournal;
    const closingRetainedEarnings =
      openingRetainedEarnings + periodRetainedEarnings;
    equityItems.push({
      account: 'Retained Earnings',
      opening: Number(openingRetainedEarnings.toFixed(2)),
      period: Number(periodRetainedEarnings.toFixed(2)),
      closing: Number(closingRetainedEarnings.toFixed(2)),
    });

    const openingShareholderAccount = Number(
      openingJournalEquityMap.get('shareholder_account') || 0,
    );
    const periodShareholderAccount = Number(
      journalEquityMap.get('shareholder_account') || 0,
    );
    const closingShareholderAccount =
      openingShareholderAccount + periodShareholderAccount;
    equityItems.push({
      account: 'Shareholder Account',
      opening: Number(openingShareholderAccount.toFixed(2)),
      period: Number(periodShareholderAccount.toFixed(2)),
      closing: Number(closingShareholderAccount.toFixed(2)),
    });

    return {
      asOfDate,
      period: {
        startDate,
        endDate: asOfDate,
      },
      assets: {
        items: assets,
        opening: Number(openingAssets.toFixed(2)),
        period: Number(totalAssets.toFixed(2)),
        closing: Number(closingAssets.toFixed(2)),
        total: Number(totalAssets.toFixed(2)),
      },
      liabilities: {
        items: liabilities,
        opening: Number(openingLiabilities.toFixed(2)),
        period: Number(totalLiabilities.toFixed(2)),
        closing: Number(closingLiabilities.toFixed(2)),
        total: Number(totalLiabilities.toFixed(2)),
      },
      equity: {
        items: equityItems,
        revenue: Number(totalRevenue.toFixed(2)),
        creditNotes: Number(creditNotesAmount.toFixed(2)),
        debitNotes: Number(debitNotesAmount.toFixed(2)),
        netRevenue: Number(netRevenue.toFixed(2)),
        expenses: Number(totalExpenses.toFixed(2)),
        journalEquity: Number(journalEquity.toFixed(2)),
        journalShareholder: Number(journalShareholder.toFixed(2)),
        opening: Number(openingEquity.toFixed(2)),
        period: Number(totalEquity.toFixed(2)),
        closing: Number(closingEquity.toFixed(2)),
        total: Number(closingEquity.toFixed(2)),
        net: Number(totalEquity.toFixed(2)),
      },
      summary: {
        openingAssets: Number(openingAssets.toFixed(2)),
        openingLiabilities: Number(openingLiabilities.toFixed(2)),
        openingEquity: Number(openingEquity.toFixed(2)),
        openingBalance: Number(
          (openingAssets - openingLiabilities - openingEquity).toFixed(2),
        ),
        periodAssets: Number(totalAssets.toFixed(2)),
        periodLiabilities: Number(totalLiabilities.toFixed(2)),
        periodEquity: Number(totalEquity.toFixed(2)),
        totalAssets: Number(totalAssets.toFixed(2)),
        totalLiabilities: Number(totalLiabilities.toFixed(2)),
        totalEquity: Number(totalEquity.toFixed(2)),
        closingAssets: Number(closingAssets.toFixed(2)),
        closingLiabilities: Number(closingLiabilities.toFixed(2)),
        closingEquity: Number(closingEquity.toFixed(2)),
        closingBalance: Number(
          (closingAssets - closingLiabilities - closingEquity).toFixed(2),
        ),
        balance: Number(
          (totalAssets - totalLiabilities - totalEquity).toFixed(2),
        ),
      },
    };
  }

  private async buildProfitAndLoss(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    const startDate =
      filters?.['startDate'] ||
      new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const endDate =
      filters?.['endDate'] || new Date().toISOString().split('T')[0];

    const revenueQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        'SUM(COALESCE(invoice.base_amount, invoice.amount)) AS revenue',
        'SUM(invoice.vat_amount) AS vat',
        'COUNT(invoice.id) AS count',
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date >= :startDate', { startDate })
      .andWhere('invoice.invoice_date <= :endDate', { endDate });

    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      revenueQuery.andWhere('invoice.status IN (:...statuses)', { statuses });
    }

    const creditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select([
        'SUM(COALESCE(creditNote.base_amount, creditNote.amount)) AS amount',
        'SUM(creditNote.vat_amount) AS vat',
        'COUNT(creditNote.id) AS count',
      ])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date >= :startDate', { startDate })
      .andWhere('creditNote.credit_note_date <= :endDate', { endDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      });

    const debitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'SUM(COALESCE(debitNote.base_amount, debitNote.amount)) AS amount',
        'SUM(debitNote.vat_amount) AS vat',
        'COUNT(debitNote.id) AS count',
      ])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
      .andWhere('debitNote.debit_note_date <= :endDate', { endDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    const [revenueResult, creditNotesResult, debitNotesResult] =
      await Promise.all([
        revenueQuery.getRawOne(),
        creditNotesQuery.getRawOne(),
        debitNotesQuery.getRawOne(),
      ]);

    const totalRevenue = Number(revenueResult?.revenue || 0);
    const revenueVat = Number(revenueResult?.vat || 0);
    const creditNotesAmount = Number(creditNotesResult?.amount || 0);
    const creditNotesVat = Number(creditNotesResult?.vat || 0);
    const debitNotesAmount = Number(debitNotesResult?.amount || 0);
    const debitNotesVat = Number(debitNotesResult?.vat || 0);

    const netRevenue = totalRevenue - creditNotesAmount + debitNotesAmount;
    const netRevenueVat = revenueVat - creditNotesVat + debitNotesVat;

    const expenseQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .leftJoin('expense.category', 'category')
      .select([
        "COALESCE(category.name, 'Uncategorized') AS category",
        'SUM(COALESCE(expense.base_amount, expense.amount)) AS amount',
        'SUM(expense.vat_amount) AS vat',
        'COUNT(expense.id) AS count',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date >= :startDate', { startDate })
      .andWhere('expense.expense_date <= :endDate', { endDate })
      .andWhere("(expense.type IS NULL OR expense.type != 'credit')")
      .groupBy('category.name')
      .orderBy('amount', 'DESC');

    if (filters?.['type']) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      expenseQuery.andWhere('expense.type IN (:...types)', { types });
    }

    const expenseRows = await expenseQuery.getRawMany();
    const totalExpenses = expenseRows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );
    const expenseVat = expenseRows.reduce(
      (sum, row) => sum + Number(row.vat || 0),
      0,
    );

    const netProfit = netRevenue - totalExpenses;

    const openingRevenueQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select(['SUM(COALESCE(invoice.base_amount, invoice.amount)) AS revenue'])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date < :startDate', { startDate });

    const openingExpensesQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select(['SUM(COALESCE(expense.base_amount, expense.amount)) AS amount'])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date < :startDate', { startDate })
      .andWhere("(expense.type IS NULL OR expense.type != 'credit')");

    if (filters?.['type']) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      openingExpensesQuery.andWhere('expense.type IN (:...types)', { types });
    }

    const [openingRevenueRow, openingExpensesRow] = await Promise.all([
      openingRevenueQuery.getRawOne(),
      openingExpensesQuery.getRawOne(),
    ]);

    const openingRevenue = Number(openingRevenueRow?.revenue || 0);
    const openingExpenses = Number(openingExpensesRow?.amount || 0);
    const openingRetainedEarnings = openingRevenue - openingExpenses;

    const closingRetainedEarnings = openingRetainedEarnings + netProfit;

    return {
      period: {
        startDate,
        endDate,
      },
      revenue: {
        amount: Number(totalRevenue.toFixed(2)),
        vat: Number(revenueVat.toFixed(2)),
        total: Number((totalRevenue + revenueVat).toFixed(2)),
        count: Number(revenueResult?.count || 0),
        creditNotes: {
          amount: Number(creditNotesAmount.toFixed(2)),
          vat: Number(creditNotesVat.toFixed(2)),
          total: Number((creditNotesAmount + creditNotesVat).toFixed(2)),
          count: Number(creditNotesResult?.count || 0),
        },
        debitNotes: {
          amount: Number(debitNotesAmount.toFixed(2)),
          vat: Number(debitNotesVat.toFixed(2)),
          total: Number((debitNotesAmount + debitNotesVat).toFixed(2)),
          count: Number(debitNotesResult?.count || 0),
        },
        netAmount: Number(netRevenue.toFixed(2)),
        netVat: Number(netRevenueVat.toFixed(2)),
        netTotal: Number((netRevenue + netRevenueVat).toFixed(2)),
      },
      expenses: {
        items: expenseRows.map((row) => ({
          category: row.category,
          amount: Number(row.amount || 0),
          vat: Number(row.vat || 0),
          total: Number(
            (Number(row.amount || 0) + Number(row.vat || 0)).toFixed(2),
          ),
          count: Number(row.count || 0),
        })),
        total: Number(totalExpenses.toFixed(2)),
        vat: Number(expenseVat.toFixed(2)),
        grandTotal: Number((totalExpenses + expenseVat).toFixed(2)),
      },
      summary: {
        openingRetainedEarnings: Number(openingRetainedEarnings.toFixed(2)),
        grossProfit: Number(netRevenue.toFixed(2)),
        totalExpenses: Number(totalExpenses.toFixed(2)),
        netProfit: Number(netProfit.toFixed(2)),
        closingRetainedEarnings: Number(closingRetainedEarnings.toFixed(2)),
        netProfitMargin:
          netRevenue > 0
            ? Number(((netProfit / netRevenue) * 100).toFixed(2))
            : 0,
      },
    };
  }

  private async buildPayables(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    const asOfDate =
      filters?.['endDate'] || new Date().toISOString().split('T')[0];
    const startDate = filters?.['startDate'] || null;

    const query = this.accrualsRepository
      .createQueryBuilder('accrual')
      .leftJoin('accrual.expense', 'expense')
      .leftJoin('expense.category', 'category')
      .select([
        'accrual.id AS accrualId',
        'accrual.vendor_name AS vendor',
        'accrual.amount AS amount',
        'accrual.expected_payment_date AS expectedDate',
        'accrual.settlement_date AS settlementDate',
        'accrual.status AS status',
        "COALESCE(category.name, 'Uncategorized') AS category",
        'expense.description AS description',
      ])
      .where('accrual.organization_id = :organizationId', { organizationId })
      .andWhere('accrual.is_deleted = false');

    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      query.andWhere('accrual.status IN (:...statuses)', { statuses });
    } else {
      query.andWhere('accrual.status = :status', {
        status: AccrualStatus.PENDING_SETTLEMENT,
      });
    }

    if (filters?.['endDate']) {
      query.andWhere('accrual.created_at::date <= :asOfDate', {
        asOfDate: filters.endDate,
      });
    }

    if (filters?.['startDate']) {
    }

    if (filters?.['vendorName']) {
      const vendors = Array.isArray(filters.vendorName)
        ? filters.vendorName
        : [filters.vendorName];
      query.andWhere('accrual.vendor_name IN (:...vendors)', { vendors });
    }

    query.orderBy('accrual.expected_payment_date', 'ASC');

    const rows = await query.getRawMany();

    const overdueItems = rows.filter(
      (row) =>
        row.status === AccrualStatus.PENDING_SETTLEMENT &&
        (row.expecteddate || row.expectedDate) &&
        new Date(row.expecteddate || row.expectedDate) < new Date(asOfDate),
    );

    const totalAmount = rows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );
    const overdueAmount = overdueItems.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );

    let openingBalance = 0;
    let periodAmount = totalAmount;

    if (startDate) {
      const openingQuery = this.accrualsRepository
        .createQueryBuilder('accrual')
        .select(['SUM(accrual.amount) AS amount'])
        .where('accrual.organization_id = :organizationId', { organizationId })
        .andWhere('accrual.is_deleted = false')
        .andWhere('accrual.status = :status', {
          status: AccrualStatus.PENDING_SETTLEMENT,
        })
        .andWhere('accrual.created_at::date < :startDate', { startDate });

      if (filters?.['status']) {
        const statuses = Array.isArray(filters.status)
          ? filters.status
          : [filters.status];
        openingQuery.andWhere('accrual.status IN (:...statuses)', { statuses });
      }

      const openingRow = await openingQuery.getRawOne();
      openingBalance = Number(openingRow?.amount || 0);

      const periodQuery = this.accrualsRepository
        .createQueryBuilder('accrual')
        .select(['SUM(accrual.amount) AS amount'])
        .where('accrual.organization_id = :organizationId', { organizationId })
        .andWhere('accrual.is_deleted = false')
        .andWhere('accrual.created_at::date >= :startDate', { startDate })
        .andWhere('accrual.created_at::date <= :asOfDate', { asOfDate });

      if (filters?.['status']) {
        const statuses = Array.isArray(filters.status)
          ? filters.status
          : [filters.status];
        periodQuery.andWhere('accrual.status IN (:...statuses)', { statuses });
      } else {
        periodQuery.andWhere('accrual.status = :status', {
          status: AccrualStatus.PENDING_SETTLEMENT,
        });
      }

      const periodRow = await periodQuery.getRawOne();
      periodAmount = Number(periodRow?.amount || 0);
    }

    const closingBalance = openingBalance + periodAmount;

    return {
      asOfDate,
      period: startDate ? { startDate, endDate: asOfDate } : undefined,
      items: rows.map((row) => ({
        accrualId: row.accrualid || row.accrualId,
        vendor: row.vendor || 'N/A',
        amount: Number(row.amount || 0),
        expectedDate: row.expecteddate || row.expectedDate,
        settlementDate: row.settlementdate || row.settlementDate,
        status: row.status,
        category: row.category,
        description: row.description || 'N/A',
        isOverdue:
          row.status === AccrualStatus.PENDING_SETTLEMENT &&
          (row.expecteddate || row.expectedDate) &&
          new Date(row.expecteddate || row.expectedDate) < new Date(asOfDate),
      })),
      summary: {
        openingBalance: Number(openingBalance.toFixed(2)),
        periodAmount: Number(periodAmount.toFixed(2)),
        closingBalance: Number(closingBalance.toFixed(2)),
        totalItems: rows.length,
        totalAmount: Number(totalAmount.toFixed(2)),
        overdueItems: overdueItems.length,
        overdueAmount: Number(overdueAmount.toFixed(2)),
        paidItems: rows.filter((r) => r.status === AccrualStatus.SETTLED)
          .length,
        pendingItems: rows.filter(
          (r) => r.status === AccrualStatus.PENDING_SETTLEMENT,
        ).length,
      },
    };
  }

  private async buildReceivables(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    const asOfDate =
      filters?.['endDate'] || new Date().toISOString().split('T')[0];
    const startDate = filters?.['startDate'] || null;

    const creditNoteApplicationsSubquery = this.creditNoteApplicationsRepository
      .createQueryBuilder('cna')
      .select('COALESCE(SUM(cna.appliedAmount), 0)')
      .where('cna.invoice_id = invoice.id')
      .andWhere('cna.organization_id = :organizationId', { organizationId })
      .getQuery();

    const query = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .leftJoin('invoice.customer', 'customer')
      .select([
        'invoice.id AS invoiceId',
        'invoice.invoice_number AS invoiceNumber',
        "COALESCE(customer.name, invoice.customer_name, 'N/A') AS customer",
        'invoice.amount AS amount',
        'invoice.vat_amount AS vat',
        'invoice.total_amount AS total',
        'invoice.invoice_date AS invoiceDate',
        'invoice.due_date AS dueDate',
        'invoice.paid_amount AS paidAmount',
        'invoice.paid_date AS paidDate',
        'invoice.status AS status',
        'invoice.payment_status AS paymentStatus',
        `(${creditNoteApplicationsSubquery}) AS appliedCreditAmount`,
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .setParameter('organizationId', organizationId);

    if (filters?.['paymentStatus']) {
      const statuses = Array.isArray(filters.paymentStatus)
        ? filters.paymentStatus
        : [filters.paymentStatus];
      query.andWhere('invoice.payment_status IN (:...statuses)', { statuses });
    } else {
    }

    if (filters?.['status']) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      query.andWhere('invoice.status IN (:...statuses)', { statuses });
    }

    if (filters?.['endDate']) {
      query.andWhere('invoice.invoice_date <= :endDate', {
        endDate: filters.endDate,
      });
    }

    if (filters?.['customerName']) {
      const customers = Array.isArray(filters.customerName)
        ? filters.customerName
        : [filters.customerName];
      query.andWhere(
        '(customer.name IN (:...customers) OR invoice.customer_name IN (:...customers))',
        { customers },
      );
    }

    query.orderBy('invoice.due_date', 'ASC');

    const rows = await query.getRawMany();

    const unappliedCreditNoteApplicationsSubquery =
      this.creditNoteApplicationsRepository
        .createQueryBuilder('cna')
        .select('COALESCE(SUM(cna.appliedAmount), 0)')
        .where('cna.credit_note_id = creditNote.id')
        .andWhere('cna.organization_id = :organizationId', { organizationId })
        .getQuery();

    const unappliedCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .leftJoin('creditNote.customer', 'customer')
      .leftJoin('creditNote.invoice', 'invoice')
      .select([
        'creditNote.id AS creditNoteId',
        'creditNote.credit_note_number AS creditNoteNumber',
        "COALESCE(customer.name, creditNote.customer_name, 'N/A') AS customer",
        'creditNote.amount AS amount',
        'creditNote.vat_amount AS vat',
        'creditNote.total_amount AS total',
        'creditNote.credit_note_date AS creditNoteDate',
        'creditNote.status AS status',
        'invoice.invoice_number AS relatedInvoice',
        `(${unappliedCreditNoteApplicationsSubquery}) AS appliedAmount`,
      ])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      })
      .andWhere(
        `creditNote.total_amount > (${unappliedCreditNoteApplicationsSubquery})`,
      )
      .setParameter('organizationId', organizationId);

    if (filters?.['startDate']) {
      unappliedCreditNotesQuery.andWhere(
        'creditNote.credit_note_date >= :startDate',
        {
          startDate: filters.startDate,
        },
      );
    }
    if (filters?.['endDate']) {
      unappliedCreditNotesQuery.andWhere(
        'creditNote.credit_note_date <= :endDate',
        {
          endDate: filters.endDate,
        },
      );
    }
    if (filters?.['customerName']) {
      const customers = Array.isArray(filters.customerName)
        ? filters.customerName
        : [filters.customerName];
      unappliedCreditNotesQuery.andWhere(
        '(customer.name IN (:...customers) OR creditNote.customer_name IN (:...customers))',
        { customers },
      );
    }

    const debitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .leftJoin('debitNote.customer', 'customer')
      .leftJoin('debitNote.invoice', 'invoice')
      .select([
        'debitNote.id AS debitNoteId',
        'debitNote.debit_note_number AS debitNoteNumber',
        "COALESCE(customer.name, debitNote.customer_name, 'N/A') AS customer",
        'debitNote.amount AS amount',
        'debitNote.vat_amount AS vat',
        'debitNote.total_amount AS total',
        'debitNote.debit_note_date AS debitNoteDate',
        'debitNote.status AS status',
        'invoice.invoice_number AS relatedInvoice',
      ])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      });

    if (filters?.['startDate']) {
      debitNotesQuery.andWhere('debitNote.debit_note_date >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters?.['endDate']) {
      debitNotesQuery.andWhere('debitNote.debit_note_date <= :endDate', {
        endDate: filters.endDate,
      });
    }
    if (filters?.['customerName']) {
      const customers = Array.isArray(filters.customerName)
        ? filters.customerName
        : [filters.customerName];
      debitNotesQuery.andWhere(
        '(customer.name IN (:...customers) OR debitNote.customer_name IN (:...customers))',
        { customers },
      );
    }

    const [unappliedCreditNotesRows, debitNotesRows] = await Promise.all([
      unappliedCreditNotesQuery.getRawMany(),
      debitNotesQuery.getRawMany(),
    ]);

    const invoiceItems = rows.map((row) => {
      const total = Number(row.total || 0);
      const paid = Number(row.paidamount || row.paidAmount || 0);
      const appliedCreditAmount = Number(
        row.appliedcreditamount || row.appliedCreditAmount || 0,
      );

      const outstanding = Math.max(0, total - paid - appliedCreditAmount);
      const paymentStatus = row.paymentstatus || row.paymentStatus;
      const dueDate = row.duedate || row.dueDate;
      const isOverdue =
        paymentStatus !== PaymentStatus.PAID &&
        dueDate &&
        new Date(dueDate) < new Date(asOfDate);

      return {
        type: 'invoice',
        invoiceId: row.invoiceid || row.invoiceId,
        invoiceNumber: row.invoicenumber || row.invoiceNumber,
        customer: row.customer,
        amount: Number(row.amount || 0),
        vat: Number(row.vat || 0),
        total: total,
        paid: paid,
        outstanding: outstanding,
        invoiceDate: row.invoicedate || row.invoiceDate,
        dueDate: dueDate,
        paidDate: row.paiddate || row.paidDate,
        status: row.status,
        paymentStatus: paymentStatus,
        isOverdue,
      };
    });

    const unappliedCreditNoteItems = unappliedCreditNotesRows.map((row) => {
      const total = Number(row.total || 0);
      const appliedAmount = Number(row.appliedamount || row.appliedAmount || 0);
      const unappliedAmount = total - appliedAmount;
      return {
        type: 'credit_note',
        creditNoteId: row.creditnoteid || row.creditNoteId,
        creditNoteNumber: row.creditnotenumber || row.creditNoteNumber,
        customer: row.customer,
        amount: Number(row.amount || 0),
        vat: Number(row.vat || 0),
        total: total,
        appliedAmount: appliedAmount,
        unappliedAmount: unappliedAmount,
        paid: 0,
        outstanding: -unappliedAmount,
        invoiceDate: row.creditnotedate || row.creditNoteDate,
        dueDate: null,
        paidDate: null,
        status: row.status,
        paymentStatus: null,
        relatedInvoice: row.relatedinvoice || row.relatedInvoice,
        isOverdue: false,
      };
    });

    const debitNoteItems = debitNotesRows.map((row) => {
      const total = Number(row.total || 0);
      return {
        type: 'debit_note',
        debitNoteId: row.debitnoteid || row.debitNoteId,
        debitNoteNumber: row.debitnotenumber || row.debitNoteNumber,
        customer: row.customer,
        amount: Number(row.amount || 0),
        vat: Number(row.vat || 0),
        total: total,
        paid: 0,
        outstanding: total,
        invoiceDate: row.debitnotedate || row.debitNoteDate,
        dueDate: null,
        paidDate: null,
        status: row.status,
        paymentStatus: null,
        relatedInvoice: row.relatedinvoice || row.relatedInvoice,
        isOverdue: false,
      };
    });

    const filteredInvoiceItems = invoiceItems.filter(
      (item) => item.outstanding > 0,
    );

    const allItems = [
      ...filteredInvoiceItems,
      ...unappliedCreditNoteItems,
      ...debitNoteItems,
    ];

    const overdueItems = allItems.filter((item) => item.isOverdue);
    const totalOutstanding = allItems.reduce(
      (sum, item) => sum + item.outstanding,
      0,
    );
    const overdueAmount = overdueItems.reduce(
      (sum, item) => sum + item.outstanding,
      0,
    );

    let openingBalance = 0;
    let periodOutstanding = totalOutstanding;

    if (startDate) {
      const openingCreditNoteApplicationsSubquery =
        this.creditNoteApplicationsRepository
          .createQueryBuilder('cna')
          .select('COALESCE(SUM(cna.appliedAmount), 0)')
          .where('cna.invoice_id = invoice.id')
          .andWhere('cna.organization_id = :organizationId', { organizationId })
          .getQuery();

      const openingInvoicesQueryWithCN = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select([
          `SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0) - (${openingCreditNoteApplicationsSubquery})) AS outstanding`,
        ])
        .where('invoice.organization_id = :organizationId', { organizationId })
        .andWhere('invoice.invoice_date < :startDate', { startDate })
        .andWhere('invoice.payment_status IN (:...statuses)', {
          statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
        })
        .setParameter('organizationId', organizationId);

      if (filters?.['paymentStatus']) {
        const statuses = Array.isArray(filters.paymentStatus)
          ? filters.paymentStatus
          : [filters.paymentStatus];
        openingInvoicesQueryWithCN.andWhere(
          'invoice.payment_status IN (:...statuses)',
          { statuses },
        );
      }

      const openingDebitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select(['SUM(COALESCE(debitNote.total_amount, 0)) AS total'])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        })
        .andWhere('debitNote.debit_note_date < :startDate', { startDate });

      const [openingInvoicesRow, openingDebitNotesRow] = await Promise.all([
        openingInvoicesQueryWithCN.getRawOne(),
        openingDebitNotesQuery.getRawOne(),
      ]);

      const openingInvoices = Number(openingInvoicesRow?.outstanding || 0);
      const openingDebitNotes = Number(openingDebitNotesRow?.total || 0);
      openingBalance = openingInvoices + openingDebitNotes;

      const periodCreditNoteApplicationsSubquery =
        this.creditNoteApplicationsRepository
          .createQueryBuilder('cna')
          .select('COALESCE(SUM(cna.appliedAmount), 0)')
          .where('cna.invoice_id = invoice.id')
          .andWhere('cna.organization_id = :organizationId', { organizationId })
          .getQuery();

      const periodInvoicesQuery = this.salesInvoicesRepository
        .createQueryBuilder('invoice')
        .select([
          `SUM(COALESCE(invoice.total_amount, 0) - COALESCE(invoice.paid_amount, 0) - (${periodCreditNoteApplicationsSubquery})) AS outstanding`,
        ])
        .where('invoice.organization_id = :organizationId', { organizationId })
        .andWhere('invoice.invoice_date >= :startDate', { startDate })
        .andWhere('invoice.invoice_date <= :asOfDate', { asOfDate })
        .andWhere('invoice.payment_status IN (:...statuses)', {
          statuses: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
        })
        .setParameter('organizationId', organizationId);

      if (filters?.['paymentStatus']) {
        const statuses = Array.isArray(filters.paymentStatus)
          ? filters.paymentStatus
          : [filters.paymentStatus];
        periodInvoicesQuery.andWhere(
          'invoice.payment_status IN (:...statuses)',
          { statuses },
        );
      }

      const periodDebitNotesQuery = this.debitNotesRepository
        .createQueryBuilder('debitNote')
        .select(['SUM(COALESCE(debitNote.total_amount, 0)) AS total'])
        .where('debitNote.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('debitNote.status IN (:...statuses)', {
          statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
        })
        .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
        .andWhere('debitNote.debit_note_date <= :asOfDate', { asOfDate });

      const [periodInvoicesRow, periodDebitNotesRow] = await Promise.all([
        periodInvoicesQuery.getRawOne(),
        periodDebitNotesQuery.getRawOne(),
      ]);

      const periodInvoices = Number(periodInvoicesRow?.outstanding || 0);
      const periodDebitNotes = Number(periodDebitNotesRow?.total || 0);
      periodOutstanding = periodInvoices + periodDebitNotes;
    }

    const closingBalance = openingBalance + periodOutstanding;

    return {
      asOfDate,
      period: startDate ? { startDate, endDate: asOfDate } : undefined,
      items: allItems,
      summary: {
        openingBalance: Number(openingBalance.toFixed(2)),
        periodOutstanding: Number(periodOutstanding.toFixed(2)),
        periodAmount: Number(periodOutstanding.toFixed(2)),
        closingBalance: Number(closingBalance.toFixed(2)),
        totalInvoices: filteredInvoiceItems.length,
        totalCreditNotes: unappliedCreditNoteItems.length,
        totalDebitNotes: debitNoteItems.length,
        totalItems: allItems.length,
        totalOutstanding: Number(totalOutstanding.toFixed(2)),
        overdueInvoices: overdueItems.length,
        overdueAmount: Number(overdueAmount.toFixed(2)),
        paidInvoices: filteredInvoiceItems.filter(
          (i) => i.paymentStatus === PaymentStatus.PAID,
        ).length,
        unpaidInvoices: filteredInvoiceItems.filter(
          (i) => i.paymentStatus === PaymentStatus.UNPAID,
        ).length,
        partialInvoices: filteredInvoiceItems.filter(
          (i) => i.paymentStatus === PaymentStatus.PARTIAL,
        ).length,
      },
    };
  }

  private async buildVatControlAccount(
    organizationId: string,
    filters?: Record<string, any>,
  ) {
    let startDate = filters?.['startDate'];
    let endDate = filters?.['endDate'];

    if (!startDate || !endDate) {
      const today = new Date();
      startDate = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .split('T')[0];
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
        .toISOString()
        .split('T')[0];
    }

    const vatInputQuery = this.expensesRepository
      .createQueryBuilder('expense')
      .select([
        'expense.id AS expenseId',
        'expense.expense_date AS expenseDate',
        'expense.description AS description',
        'expense.vendor_name AS vendorName',
        'expense.vendor_trn AS trn',
        'COALESCE(expense.base_amount, expense.amount) AS amount',
        'expense.vat_amount AS vatAmount',
        'expense.vat_tax_type AS vatTaxType',
      ])
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.is_deleted = false')
      .andWhere('expense.expense_date >= :startDate', { startDate })
      .andWhere('expense.expense_date <= :endDate', { endDate })
      .andWhere('CAST(expense.vat_amount AS DECIMAL) > 0')
      .andWhere(
        "(expense.vat_tax_type IS NULL OR expense.vat_tax_type != 'reverse_charge')",
      )
      .andWhere("(expense.type IS NULL OR expense.type != 'credit')")
      .orderBy('expense.expense_date', 'DESC');

    const vatInputExpenses = await vatInputQuery.getRawMany();

    const vatInputItems = vatInputExpenses.map((expense: any) => {
      const vatAmount = parseFloat(
        expense.vatamount || expense.vatAmount || '0',
      );
      const amount = parseFloat(expense.amount || '0');

      const baseAmount = amount;
      const grossAmount = amount + vatAmount;
      const vatRate =
        baseAmount > 0 ? ((vatAmount / baseAmount) * 100).toFixed(2) : '0';
      const vendorName = expense.vendorname || expense.vendorName || 'N/A';
      const trn = expense.trn || null;

      return {
        id: expense.expenseid || expense.expenseId,
        date: expense.expensedate || expense.expenseDate,
        description: expense.description || vendorName || 'Expense',
        vendorName: vendorName,
        amount: Number(baseAmount.toFixed(2)),
        grossAmount: Number(grossAmount.toFixed(2)),
        vatRate: Number(vatRate),
        vatAmount: Number(vatAmount.toFixed(2)),
        trn: trn,
        type: 'expense',
      };
    });

    const vatOutputQuery = this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .select([
        'invoice.id AS invoiceId',
        'invoice.invoice_date AS invoiceDate',
        'invoice.invoice_number AS invoiceNumber',
        'invoice.customer_name AS customerName',
        'invoice.customer_trn AS trn',
        'invoice.amount AS amount',
        'invoice.vat_amount AS vatAmount',
      ])
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.is_deleted = false')
      .andWhere('invoice.invoice_date >= :startDate', { startDate })
      .andWhere('invoice.invoice_date <= :endDate', { endDate })
      .andWhere('CAST(invoice.vat_amount AS DECIMAL) > 0')
      .orderBy('invoice.invoice_date', 'DESC');

    const vatCreditNotesQuery = this.creditNotesRepository
      .createQueryBuilder('creditNote')
      .select([
        'creditNote.id AS creditNoteId',
        'creditNote.credit_note_date AS creditNoteDate',
        'creditNote.credit_note_number AS creditNoteNumber',
        'creditNote.customer_name AS customerName',
        'creditNote.customer_trn AS trn',
        'creditNote.amount AS amount',
        'creditNote.vat_amount AS vatAmount',
      ])
      .where('creditNote.organization_id = :organizationId', { organizationId })
      .andWhere('creditNote.credit_note_date >= :startDate', { startDate })
      .andWhere('creditNote.credit_note_date <= :endDate', { endDate })
      .andWhere('creditNote.status IN (:...statuses)', {
        statuses: [CreditNoteStatus.ISSUED, CreditNoteStatus.APPLIED],
      })
      .andWhere('CAST(creditNote.vat_amount AS DECIMAL) > 0')
      .orderBy('creditNote.credit_note_date', 'DESC');

    const vatDebitNotesQuery = this.debitNotesRepository
      .createQueryBuilder('debitNote')
      .select([
        'debitNote.id AS debitNoteId',
        'debitNote.debit_note_date AS debitNoteDate',
        'debitNote.debit_note_number AS debitNoteNumber',
        'debitNote.customer_name AS customerName',
        'debitNote.customer_trn AS trn',
        'debitNote.amount AS amount',
        'debitNote.vat_amount AS vatAmount',
      ])
      .where('debitNote.organization_id = :organizationId', { organizationId })
      .andWhere('debitNote.debit_note_date >= :startDate', { startDate })
      .andWhere('debitNote.debit_note_date <= :endDate', { endDate })
      .andWhere('debitNote.status IN (:...statuses)', {
        statuses: [DebitNoteStatus.ISSUED, DebitNoteStatus.APPLIED],
      })
      .andWhere('CAST(debitNote.vat_amount AS DECIMAL) > 0')
      .orderBy('debitNote.debit_note_date', 'DESC');

    const [vatOutputInvoices, vatCreditNotes, vatDebitNotes] =
      await Promise.all([
        vatOutputQuery.getRawMany(),
        vatCreditNotesQuery.getRawMany(),
        vatDebitNotesQuery.getRawMany(),
      ]);

    const vatOutputItems = vatOutputInvoices.map((invoice: any) => {
      const vatAmount = parseFloat(
        invoice.vatamount || invoice.vatAmount || '0',
      );
      const amount = parseFloat(invoice.amount || '0');

      const baseAmount = amount;
      const grossAmount = amount + vatAmount;
      const vatRate =
        baseAmount > 0 ? ((vatAmount / baseAmount) * 100).toFixed(2) : '0';
      const customerName =
        invoice.customername || invoice.customerName || 'N/A';
      const trn = invoice.trn || null;

      return {
        id: invoice.invoiceid || invoice.invoiceId,
        date: invoice.invoicedate || invoice.invoiceDate,
        description:
          invoice.invoicenumber ||
          invoice.invoiceNumber ||
          customerName ||
          'Invoice',
        invoiceNumber: invoice.invoicenumber || invoice.invoiceNumber,
        customerName: customerName,
        amount: Number(baseAmount.toFixed(2)),
        grossAmount: Number(grossAmount.toFixed(2)),
        vatRate: Number(vatRate),
        vatAmount: Number(vatAmount.toFixed(2)),
        trn: trn,
        type: 'invoice',
      };
    });

    const vatCreditNoteItems = vatCreditNotes.map((creditNote: any) => {
      const vatAmount = parseFloat(
        creditNote.vatamount || creditNote.vatAmount || '0',
      );
      const amount = parseFloat(creditNote.amount || '0');

      const baseAmount = amount;
      const grossAmount = amount + vatAmount;
      const vatRate =
        baseAmount > 0 ? ((vatAmount / baseAmount) * 100).toFixed(2) : '0';
      const customerName =
        creditNote.customername || creditNote.customerName || 'N/A';
      const trn = creditNote.trn || null;

      return {
        id: creditNote.creditnoteid || creditNote.creditNoteId,
        date: creditNote.creditnotedate || creditNote.creditNoteDate,
        description:
          creditNote.creditnotenumber ||
          creditNote.creditNoteNumber ||
          customerName ||
          'Credit Note',
        creditNoteNumber:
          creditNote.creditnotenumber || creditNote.creditNoteNumber,
        customerName: customerName,
        amount: Number(baseAmount.toFixed(2)),
        grossAmount: Number(grossAmount.toFixed(2)),
        vatRate: Number(vatRate),
        vatAmount: Number(vatAmount.toFixed(2)),
        trn: trn,
        type: 'credit_note',
      };
    });

    const vatDebitNoteItems = vatDebitNotes.map((debitNote: any) => {
      const vatAmount = parseFloat(
        debitNote.vatamount || debitNote.vatAmount || '0',
      );
      const amount = parseFloat(debitNote.amount || '0');

      const baseAmount = amount;
      const grossAmount = amount + vatAmount;
      const vatRate =
        baseAmount > 0 ? ((vatAmount / baseAmount) * 100).toFixed(2) : '0';
      const customerName =
        debitNote.customername || debitNote.customerName || 'N/A';
      const trn = debitNote.trn || null;

      return {
        id: debitNote.debitnoteid || debitNote.debitNoteId,
        date: debitNote.debitnotedate || debitNote.debitNoteDate,
        description:
          debitNote.debitnotenumber ||
          debitNote.debitNoteNumber ||
          customerName ||
          'Debit Note',
        debitNoteNumber: debitNote.debitnotenumber || debitNote.debitNoteNumber,
        customerName: customerName,
        amount: Number(baseAmount.toFixed(2)),
        grossAmount: Number(grossAmount.toFixed(2)),
        vatRate: Number(vatRate),
        vatAmount: Number(vatAmount.toFixed(2)),
        trn: trn,
        type: 'debit_note',
      };
    });

    const totalVatInput = vatInputItems.reduce(
      (sum, item) => sum + item.vatAmount,
      0,
    );
    const totalVatOutput = vatOutputItems.reduce(
      (sum, item) => sum + item.vatAmount,
      0,
    );
    const totalVatCreditNotes = vatCreditNoteItems.reduce(
      (sum, item) => sum + item.vatAmount,
      0,
    );
    const totalVatDebitNotes = vatDebitNoteItems.reduce(
      (sum, item) => sum + item.vatAmount,
      0,
    );

    const netVatOutput =
      totalVatOutput - totalVatCreditNotes + totalVatDebitNotes;
    const netVat = netVatOutput - totalVatInput;

    return {
      startDate,
      endDate,
      vatInputItems,
      vatOutputItems: [
        ...vatOutputItems,
        ...vatCreditNoteItems,
        ...vatDebitNoteItems,
      ],
      summary: {
        vatInput: Number(totalVatInput.toFixed(2)),
        vatOutput: Number(totalVatOutput.toFixed(2)),
        vatCreditNotes: Number(totalVatCreditNotes.toFixed(2)),
        vatDebitNotes: Number(totalVatDebitNotes.toFixed(2)),
        netVatOutput: Number(netVatOutput.toFixed(2)),
        netVat: Number(netVat.toFixed(2)),
        totalTransactions:
          vatInputItems.length +
          vatOutputItems.length +
          vatCreditNoteItems.length +
          vatDebitNoteItems.length,
        inputTransactions: vatInputItems.length,
        outputTransactions: vatOutputItems.length,
        creditNoteTransactions: vatCreditNoteItems.length,
        debitNoteTransactions: vatDebitNoteItems.length,
      },
    };
  }
}
