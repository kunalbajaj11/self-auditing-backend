import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { ReportsService } from '../../../core/services/reports.service';
import { ApiService } from '../../../core/services/api.service';
import { GeneratedReport, ReportType } from '../../../core/models/report.model';
import { LicenseService } from '../../../core/services/license.service';
import { take } from 'rxjs/operators';
import {
  LedgerAccountsService,
  LedgerAccount,
} from '../../../core/services/ledger-accounts.service';

interface ReportConfig {
  value: ReportType;
  label: string;
  icon: string;
  description: string;
  color: string;
}

@Component({
  selector: 'app-admin-reports',
  templateUrl: './admin-reports.component.html',
  styleUrls: ['./admin-reports.component.scss'],
})
export class AdminReportsComponent implements OnInit {
  readonly reports: ReportConfig[] = [
    {
      value: 'trial_balance',
      label: 'Trial Balance',
      icon: 'balance',
      description: 'List of all accounts with debit and credit balances',
      color: '#1976d2',
    },
    {
      value: 'balance_sheet',
      label: 'Balance Sheet',
      icon: 'account_balance',
      description: 'Assets, liabilities, and equity at a point in time',
      color: '#2e7d32',
    },
    {
      value: 'profit_and_loss',
      label: 'Profit and Loss Statement',
      icon: 'trending_up',
      description: 'Revenue and expenses for a period',
      color: '#ed6c02',
    },
    {
      value: 'payables',
      label: 'Payables (Accruals)',
      icon: 'account_balance_wallet',
      description: 'Outstanding amounts owed to vendors',
      color: '#9c27b0',
    },
    {
      value: 'receivables',
      label: 'Receivables',
      icon: 'receipt_long',
      description: 'Outstanding amounts owed by customers',
      color: '#009688',
    },
    {
      value: 'vat_control_account',
      label: 'VAT Control Account',
      icon: 'account_balance',
      description: 'VAT input, output, and net VAT position for a period',
      color: '#d32f2f',
    },
    {
      value: 'stock_balance',
      label: 'Stock Balance Report',
      icon: 'inventory_2',
      description: 'Stock inwards, outwards, adjustments, and balance for each product',
      color: '#7b1fa2',
    },
    {
      value: 'general_ledger',
      label: 'General Ledger',
      icon: 'book',
      description: 'Complete transaction history for all accounts with opening and closing balances',
      color: '#1565c0',
    },
  ];

  readonly dateRangePresets: { value: string; label: string }[] = [
    { value: '', label: 'Custom Range' },
    { value: 'thisMonth', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
    { value: 'thisQuarter', label: 'This Quarter' },
    { value: 'lastQuarter', label: 'Last Quarter' },
    { value: 'thisYear', label: 'This Year' },
    { value: 'lastYear', label: 'Last Year' },
  ];

  form: FormGroup;
  selectedReport: ReportConfig | null = null;
  generatedReport: GeneratedReport | null = null;
  loading = false;
  vendors: string[] = [];
  customers: string[] = [];

  // Cached chart data to prevent re-rendering
  profitAndLossChartData: ChartConfiguration<'bar'>['data'] | null = null;
  expensesByCategoryChartData: ChartConfiguration<'pie'>['data'] | null = null;
  payablesChartData: ChartConfiguration<'bar'>['data'] | null = null;
  receivablesChartData: ChartConfiguration<'bar'>['data'] | null = null;
  trialBalanceChartData: ChartConfiguration<'bar'>['data'] | null = null;
  trialBalanceAccountsChartData: ChartConfiguration<'pie'>['data'] | null = null;
  balanceSheetChartData: ChartConfiguration<'pie'>['data'] | null = null;
  balanceSheetAssetsChartData: ChartConfiguration<'bar'>['data'] | null = null;
  vatControlAccountChartData: ChartConfiguration<'bar'>['data'] | null = null;

  @ViewChild('reportPreviewCard') reportPreviewCard?: ElementRef;

  private readonly ledgerAccountsById = new Map<string, LedgerAccount>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly reportsService: ReportsService,
    private readonly snackBar: MatSnackBar,
    private readonly api: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly licenseService: LicenseService,
    private readonly ledgerAccountsService: LedgerAccountsService,
  ) {
    this.form = this.fb.group({
      reportType: [''],
      dateRangePreset: [''],
      startDate: [''],
      endDate: [''],
      // Additional filters based on report type
      status: [[]],
      type: [[]],
      vendorName: [[]],
      customerName: [[]],
      paymentStatus: [[]],
    });
  }

  // Chart options - Fixed to prevent re-rendering on hover
  chartOptions: ChartOptions<'bar' | 'line' | 'pie'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 0, // Disable animations to prevent re-renders
    },
    interaction: {
      intersect: false,
      mode: 'index',
    },
    onHover: (event, activeElements) => {
      // Prevent chart from re-rendering on hover
      if (event.native) {
        (event.native.target as HTMLElement).style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
      }
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
      },
      tooltip: {
        enabled: true,
        animation: {
          duration: 0, // Disable tooltip animations
        },
        callbacks: {
          label: (context: any) => {
            const label = context.label || '';
            // Handle different chart types - parsed might be a number or object
            let value: number = 0;
            const parsed = context.parsed;
            if (typeof parsed === 'number') {
              value = parsed;
            } else if (parsed && typeof parsed === 'object') {
              if ('y' in parsed && typeof parsed.y === 'number') {
                value = parsed.y;
              } else if ('x' in parsed && typeof parsed.x === 'number') {
                value = parsed.x;
              } else {
                value = Number(parsed) || 0;
              }
            } else if (parsed !== null && parsed !== undefined) {
              value = Number(parsed) || 0;
            } else {
              // Fallback to raw value from dataset
              value = Number(context.raw) || 0;
            }
            // Ensure value is a valid number
            if (isNaN(value) || !isFinite(value)) {
              value = 0;
            }
            return `${label}: AED ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return 'AED ' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          },
        },
      },
    },
  };

  pieChartOptions: ChartOptions<'pie'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 0, // Disable animations to prevent re-renders
    },
    interaction: {
      intersect: false,
    },
    onHover: (event, activeElements) => {
      // Prevent chart from re-rendering on hover
      if (event.native) {
        (event.native.target as HTMLElement).style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
      }
    },
    plugins: {
      legend: {
        display: true,
        position: 'right',
      },
      tooltip: {
        enabled: true,
        animation: {
          duration: 0, // Disable tooltip animations
        },
        callbacks: {
          label: (context: any) => {
            const label = context.label || '';
            // Handle pie chart - parsed is usually a number
            let value: number = 0;
            const parsed = context.parsed;
            if (typeof parsed === 'number') {
              value = parsed;
            } else if (parsed && typeof parsed === 'object') {
              if ('y' in parsed && typeof parsed.y === 'number') {
                value = parsed.y;
              } else if ('x' in parsed && typeof parsed.x === 'number') {
                value = parsed.x;
              } else {
                value = Number(parsed) || 0;
              }
            } else if (parsed !== null && parsed !== undefined) {
              value = Number(parsed) || 0;
            } else {
              // Fallback to raw value from dataset
              value = Number(context.raw) || 0;
            }
            // Ensure value is a valid number
            if (isNaN(value) || !isFinite(value)) {
              value = 0;
            }
            // Calculate total and percentage
            const total = (context.dataset.data as number[]).reduce((a: number, b: number) => {
              const numA = Number(a) || 0;
              const numB = Number(b) || 0;
              return numA + numB;
            }, 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
            return `${label}: AED ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${percentage}%)`;
          },
        },
      },
    },
  };

  ngOnInit(): void {
    this.ledgerAccountsService.listLedgerAccounts().subscribe({
      next: (accounts) => {
        this.ledgerAccountsById.clear();
        accounts.forEach((a) => this.ledgerAccountsById.set(a.id, a));
      },
      error: () => {
        // Non-blocking: reports can still render using backend-provided names or raw codes.
      },
    });

    // Get report type from route data
    const reportType = this.route.snapshot.data['reportType'] as ReportType;
    this.licenseService
      .isInventoryEnabled()
      .pipe(take(1))
      .subscribe((isInventoryEnabled) => {
        // Stock Balance report is inventory-controlled
        if (reportType === 'stock_balance' && !isInventoryEnabled) {
          this.snackBar.open(
            'Inventory is not enabled for this organization. Stock Balance Report is unavailable.',
            'Close',
            { duration: 4500 },
          );
          this.router.navigate(['/admin/reports/trial-balance']);
          return;
        }

        if (reportType) {
          this.selectedReport =
            this.reports.find((r) => r.value === reportType) || null;
          if (this.selectedReport) {
            this.form.patchValue({ reportType: this.selectedReport.value });
          } else {
            // Fallback: keep component usable even if route data is wrong
            console.warn(
              `Report type ${reportType} not found, defaulting to trial balance`,
            );
            this.selectedReport =
              this.reports.find((r) => r.value === 'trial_balance') || null;
            if (this.selectedReport) {
              this.form.patchValue({ reportType: this.selectedReport.value });
            }
          }
        } else {
          // If no report type in route, default to trial balance
          this.selectedReport =
            this.reports.find((r) => r.value === 'trial_balance') || null;
          if (this.selectedReport) {
            this.form.patchValue({ reportType: this.selectedReport.value });
          }
        }

        // Set default date range to this month
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        this.form.patchValue({
          startDate: startDate.toISOString().substring(0, 10),
          endDate: endDate.toISOString().substring(0, 10),
        });

        // Load filter options (vendors and customers)
        this.loadFilterOptions();
      });
  }

  resolveAccountName(nameOrCode: string | null | undefined): string {
    if (!nameOrCode) return '—';
    if (nameOrCode.startsWith('ledger:')) {
      const id = nameOrCode.slice('ledger:'.length);
      return this.ledgerAccountsById.get(id)?.name || 'Custom Ledger Account';
    }
    return nameOrCode;
  }

  private loadFilterOptions(): void {
    this.reportsService.getFilterOptions().subscribe({
      next: (options) => {
        this.vendors = options.vendors || [];
        this.customers = options.customers || [];
        console.log('Filter options loaded:', { vendors: this.vendors.length, customers: this.customers.length });
      },
      error: (err) => {
        console.error('Failed to load filter options:', err);
        // Silently fail - filters will just be empty
        this.vendors = [];
        this.customers = [];
      },
    });
  }

  onDateRangePresetChange(preset: string): void {
    const today = new Date();
    let startDate: Date;
    let endDate: Date = today;

    switch (preset) {
      case 'thisMonth':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      case 'lastMonth':
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        endDate = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'thisQuarter':
        const quarter = Math.floor(today.getMonth() / 3);
        startDate = new Date(today.getFullYear(), quarter * 3, 1);
        endDate = new Date(today.getFullYear(), (quarter + 1) * 3, 0);
        break;
      case 'lastQuarter':
        const lastQuarter = Math.floor(today.getMonth() / 3) - 1;
        const lastQuarterYear = lastQuarter < 0 ? today.getFullYear() - 1 : today.getFullYear();
        const lastQuarterMonth = lastQuarter < 0 ? 9 : lastQuarter * 3;
        startDate = new Date(lastQuarterYear, lastQuarterMonth, 1);
        endDate = new Date(lastQuarterYear, lastQuarterMonth + 3, 0);
        break;
      case 'thisYear':
        startDate = new Date(today.getFullYear(), 0, 1);
        endDate = new Date(today.getFullYear(), 11, 31);
        break;
      case 'lastYear':
        startDate = new Date(today.getFullYear() - 1, 0, 1);
        endDate = new Date(today.getFullYear() - 1, 11, 31);
        break;
      default:
        return;
    }

    this.form.patchValue({
      startDate: startDate.toISOString().substring(0, 10),
      endDate: endDate.toISOString().substring(0, 10),
    });
  }

  generate(): void {
    if (!this.selectedReport) {
      this.snackBar.open('Please select a report type', 'Close', {
        duration: 3000,
      });
      return;
    }

    const rawValue = this.form.getRawValue();
    const filters: Record<string, any> = {};

    if (rawValue['startDate']) {
      filters['startDate'] = rawValue['startDate'];
    }
    if (rawValue['endDate']) {
      filters['endDate'] = rawValue['endDate'];
    }
    if (rawValue['status'] && rawValue['status'].length > 0) {
      filters['status'] = rawValue['status'];
    }
    if (rawValue['type'] && rawValue['type'].length > 0) {
      filters['type'] = rawValue['type'];
    }
    if (rawValue['vendorName'] && rawValue['vendorName'].length > 0) {
      filters['vendorName'] = rawValue['vendorName'];
    }
    if (rawValue['customerName'] && rawValue['customerName'].length > 0) {
      filters['customerName'] = rawValue['customerName'];
    }
    if (rawValue['paymentStatus'] && rawValue['paymentStatus'].length > 0) {
      filters['paymentStatus'] = rawValue['paymentStatus'];
    }

    this.loading = true;
    this.generatedReport = null;

    this.reportsService
      .generateReport({
        type: this.selectedReport.value,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
        format: 'json',
      })
      .subscribe({
        next: (report) => {
          this.loading = false;
          this.generatedReport = report;
          // Cache chart data to prevent re-rendering on hover
          this.updateCachedChartData(report);
          this.snackBar.open('Report generated successfully', 'Close', {
            duration: 3000,
          });
          setTimeout(() => {
            this.scrollToReportPreview();
          }, 300);
        },
        error: () => {
          this.loading = false;
          this.snackBar.open('Failed to generate report', 'Close', {
            duration: 4000,
            panelClass: ['snack-error'],
          });
        },
      });
  }

  private updateCachedChartData(report: GeneratedReport): void {
    // Reset all chart data
    this.profitAndLossChartData = null;
    this.expensesByCategoryChartData = null;
    this.payablesChartData = null;
    this.receivablesChartData = null;
    this.trialBalanceChartData = null;
    this.trialBalanceAccountsChartData = null;
    this.balanceSheetChartData = null;
    this.balanceSheetAssetsChartData = null;
    this.vatControlAccountChartData = null;

    // Update chart data based on report type
    switch (report.type) {
      case 'profit_and_loss':
        this.profitAndLossChartData = this.getProfitAndLossChartData(report);
        this.expensesByCategoryChartData = this.getExpensesByCategoryChartData(report);
        break;
      case 'payables':
        this.payablesChartData = this.getPayablesChartData(report);
        break;
      case 'receivables':
        this.receivablesChartData = this.getReceivablesChartData(report);
        break;
      case 'trial_balance':
        this.trialBalanceChartData = this.getTrialBalanceChartData(report);
        this.trialBalanceAccountsChartData = this.getTrialBalanceAccountsChartData(report);
        break;
      case 'balance_sheet':
        this.balanceSheetChartData = this.getBalanceSheetChartData(report);
        this.balanceSheetAssetsChartData = this.getBalanceSheetAssetsChartData(report);
        break;
    }
  }

  generateAndDownload(format: 'pdf' | 'xlsx' | 'csv' = 'pdf'): void {
    if (!this.generatedReport) {
      this.snackBar.open('Please generate a report first', 'Close', {
        duration: 3000,
      });
      return;
    }

    const rawValue = this.form.getRawValue();
    const filters: Record<string, any> = {};

    if (rawValue['startDate']) filters['startDate'] = rawValue['startDate'];
    if (rawValue['endDate']) filters['endDate'] = rawValue['endDate'];
    if (rawValue['status'] && rawValue['status'].length > 0) {
      filters['status'] = rawValue['status'];
    }
    if (rawValue['type'] && rawValue['type'].length > 0) {
      filters['type'] = rawValue['type'];
    }
    if (rawValue['vendorName'] && rawValue['vendorName'].length > 0) {
      filters['vendorName'] = rawValue['vendorName'];
    }
    if (rawValue['customerName'] && rawValue['customerName'].length > 0) {
      filters['customerName'] = rawValue['customerName'];
    }
    if (rawValue['paymentStatus'] && rawValue['paymentStatus'].length > 0) {
      filters['paymentStatus'] = rawValue['paymentStatus'];
    }

    this.loading = true;

    // Generate report first to get it saved in history
    this.reportsService
      .generateReport({
        type: this.generatedReport.type,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
        format: 'json',
      })
      .subscribe({
        next: () => {
          // Get the latest report from history
          this.reportsService.listHistory({ type: this.generatedReport!.type }).subscribe({
            next: (history) => {
              if (history && history.length > 0) {
                // Get the most recent report
                const latestReport = history[0];
                this.downloadReport(latestReport.id, format);
              } else {
                this.loading = false;
                this.snackBar.open('Report not found in history', 'Close', {
                  duration: 4000,
                  panelClass: ['snack-error'],
                });
              }
            },
            error: () => {
              this.loading = false;
              this.snackBar.open('Failed to get report from history', 'Close', {
                duration: 4000,
                panelClass: ['snack-error'],
              });
            },
          });
        },
        error: () => {
          this.loading = false;
          this.snackBar.open('Failed to generate report for download', 'Close', {
            duration: 4000,
            panelClass: ['snack-error'],
          });
        },
      });
  }

  private downloadReport(reportId: string, format: 'pdf' | 'xlsx' | 'csv'): void {
    this.api.download(`/reports/${reportId}/download`, { format }).subscribe({
      next: (blob) => {
        this.loading = false;
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const reportName = `${this.generatedReport!.type}_${new Date().toISOString().split('T')[0]}.${format}`;
        link.download = reportName;
        link.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Report downloaded', 'Close', { duration: 3000 });
      },
      error: () => {
        this.loading = false;
        this.snackBar.open('Failed to download report', 'Close', {
          duration: 4000,
          panelClass: ['snack-error'],
        });
      },
    });
  }

  scrollToReportPreview(): void {
    if (this.reportPreviewCard) {
      this.reportPreviewCard.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }

  // Chart data helpers
  getProfitAndLossChartData(report: GeneratedReport): ChartConfiguration<'bar'>['data'] | null {
    if (report.type !== 'profit_and_loss' || !report.data) return null;

    const data = report.data as any;
    return {
      labels: ['Revenue', 'Expenses', 'Net Profit'],
      datasets: [
        {
          label: 'Amount (AED)',
          data: [
            // Use NET revenue for consistency (invoices - credit notes + debit notes)
            Number(data.revenue?.netAmount ?? data.revenue?.amount ?? 0) || 0,
            Number(data.expenses?.total || 0) || 0,
            Number(data.summary?.netProfit || 0) || 0,
          ],
          backgroundColor: [
            'rgba(46, 125, 50, 0.7)',
            'rgba(237, 108, 2, 0.7)',
            'rgba(25, 118, 210, 0.7)',
          ],
        },
      ],
    };
  }

  getExpensesByCategoryChartData(report: GeneratedReport): ChartConfiguration<'pie'>['data'] | null {
    if (report.type !== 'profit_and_loss' || !report.data) return null;

    const data = report.data as any;
    if (!data.expenses?.items || data.expenses.items.length === 0) return null;

    return {
      labels: data.expenses.items.map((item: any) => item.category),
      datasets: [
        {
          data: data.expenses.items.map((item: any) => Number(item.amount || 0)),
          backgroundColor: [
            '#1976d2',
            '#42a5f5',
            '#66bb6a',
            '#ef5350',
            '#ffa726',
            '#ab47bc',
            '#26a69a',
            '#ff7043',
            '#78909c',
            '#8d6e63',
          ],
        },
      ],
    };
  }

  getPayablesChartData(report: GeneratedReport): ChartConfiguration<'bar'>['data'] | null {
    if (report.type !== 'payables' || !report.data) return null;

    const data = report.data as any;
    if (!data.items || data.items.length === 0) return null;

    // Group by vendor
    const vendorMap = new Map<string, number>();
    data.items.forEach((item: any) => {
      const vendor = item.vendor || 'N/A';
      const amount = Number(item.amount || 0) || 0;
      vendorMap.set(vendor, (vendorMap.get(vendor) || 0) + amount);
    });

    return {
      labels: Array.from(vendorMap.keys()),
      datasets: [
        {
          label: 'Outstanding Amount (AED)',
          data: Array.from(vendorMap.values()).map(v => Number(v) || 0),
          backgroundColor: 'rgba(156, 39, 176, 0.7)',
        },
      ],
    };
  }

  getReceivablesChartData(report: GeneratedReport): ChartConfiguration<'bar'>['data'] | null {
    if (report.type !== 'receivables' || !report.data) return null;

    const data = report.data as any;
    if (!data.items || data.items.length === 0) return null;

    // Group by customer
    const customerMap = new Map<string, number>();
    data.items.forEach((item: any) => {
      const customer = item.customer || 'N/A';
      const outstanding = Number(item.outstanding || 0) || 0;
      customerMap.set(customer, (customerMap.get(customer) || 0) + outstanding);
    });

    return {
      labels: Array.from(customerMap.keys()),
      datasets: [
        {
          label: 'Outstanding Amount (AED)',
          data: Array.from(customerMap.values()).map(v => Number(v) || 0),
          backgroundColor: 'rgba(0, 150, 136, 0.7)',
        },
      ],
    };
  }

  getTrialBalanceChartData(report: GeneratedReport): ChartConfiguration<'bar'>['data'] | null {
    if (report.type !== 'trial_balance' || !report.data) return null;

    const data = report.data as any;
    if (!data.summary) return null;

    return {
      labels: ['Total Debit', 'Total Credit', 'Balance'],
      datasets: [
        {
          label: 'Amount (AED)',
          data: [
            Number(data.summary.totalDebit || 0) || 0,
            Number(data.summary.totalCredit || 0) || 0,
            Math.abs(Number(data.summary.totalBalance || 0) || 0),
          ],
          backgroundColor: [
            'rgba(25, 118, 210, 0.7)',
            'rgba(46, 125, 50, 0.7)',
            'rgba(156, 39, 176, 0.7)',
          ],
        },
      ],
    };
  }

  getTrialBalanceAccountsChartData(report: GeneratedReport): ChartConfiguration<'pie'>['data'] | null {
    if (report.type !== 'trial_balance' || !report.data) return null;

    const data = report.data as any;
    if (!data.accounts || data.accounts.length === 0) return null;

    // Separate VAT accounts from other accounts
    const vatAccounts = data.accounts.filter((acc: any) => 
      acc.accountName.includes('VAT') || acc.accountName.includes('vat')
    );
    const otherAccounts = data.accounts.filter((acc: any) => 
      !acc.accountName.includes('VAT') && !acc.accountName.includes('vat')
    );

    // Show top 8 other accounts by balance (absolute value), plus all VAT accounts
    const sortedOtherAccounts = [...otherAccounts]
      .sort((a: any, b: any) => Math.abs(b.balance) - Math.abs(a.balance))
      .slice(0, 8);

    // Combine VAT accounts with top other accounts
    const allAccounts = [...vatAccounts, ...sortedOtherAccounts];

    if (allAccounts.length === 0) return null;

    return {
      labels: allAccounts.map((acc: any) => acc.accountName),
      datasets: [
        {
          data: allAccounts.map((acc: any) => Math.abs(Number(acc.balance || 0) || 0)),
          backgroundColor: [
            // Colors for VAT accounts (first)
            '#d32f2f', // Red for VAT Payable
            '#1976d2', // Blue for VAT Receivable
            // Colors for other accounts
            '#42a5f5',
            '#66bb6a',
            '#ef5350',
            '#ffa726',
            '#ab47bc',
            '#26a69a',
            '#ff7043',
            '#78909c',
            '#8d6e63',
          ],
        },
      ],
    };
  }

  getBalanceSheetChartData(report: GeneratedReport): ChartConfiguration<'pie'>['data'] | null {
    if (report.type !== 'balance_sheet' || !report.data) return null;

    const data = report.data as any;
    if (!data.summary) return null;

    return {
      labels: ['Assets', 'Liabilities', 'Equity'],
      datasets: [
        {
          data: [
            Math.abs(Number(data.summary.totalAssets || 0) || 0),
            Math.abs(Number(data.summary.totalLiabilities || 0) || 0),
            Math.abs(Number(data.summary.totalEquity || 0) || 0),
          ],
          backgroundColor: [
            'rgba(46, 125, 50, 0.7)',
            'rgba(237, 108, 2, 0.7)',
            'rgba(25, 118, 210, 0.7)',
          ],
        },
      ],
    };
  }

  getBalanceSheetAssetsChartData(report: GeneratedReport): ChartConfiguration<'bar'>['data'] | null {
    if (report.type !== 'balance_sheet' || !report.data) return null;

    const data = report.data as any;
    if (!data.assets?.items || data.assets.items.length === 0) return null;

    return {
      labels: data.assets.items.map((item: any) => item.category),
      datasets: [
        {
          label: 'Amount (AED)',
          data: data.assets.items.map((item: any) => Number(item.amount || 0) || 0),
          backgroundColor: 'rgba(46, 125, 50, 0.7)',
        },
      ],
    };
  }

  getVatControlAccountChartData(report: GeneratedReport): ChartConfiguration<'bar'>['data'] | null {
    if (report.type !== 'vat_control_account' || !report.data) return null;

    const data = report.data as any;
    if (!data.summary) return null;

    return {
      labels: ['VAT Input', 'VAT Output', 'Net VAT'],
      datasets: [
        {
          label: 'Amount (AED)',
          data: [
            // Use NET input/output so the chart reconciles with Net VAT
            Number(data.summary.netVatInput ?? data.summary.vatInput ?? 0) || 0,
            Number(data.summary.netVatOutput ?? data.summary.vatOutput ?? 0) || 0,
            Number(data.summary.netVat || 0) || 0,
          ],
          backgroundColor: [
            'rgba(211, 47, 47, 0.7)',
            'rgba(46, 125, 50, 0.7)',
            'rgba(25, 118, 210, 0.7)',
          ],
        },
      ],
    };
  }

  formatCurrency(value: number, showSign: boolean = false): string {
    const numValue = Number(value);
    const formatted = numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (showSign) {
      const sign = numValue >= 0 ? '+' : '';
      return `${sign}AED ${formatted}`;
    }
    return `AED ${formatted}`;
  }

  /**
   * Format currency for Trial Balance with inverted sign for credit accounts
   * Credit accounts (Liability/Revenue/Equity) show positive balances as negative for display
   * This ensures that when summing all accounts, the total equals zero
   */
  formatTrialBalanceCurrency(value: number, accountType: string, showSign: boolean = true): string {
    const numValue = Number(value);
    const isCreditAccount = accountType === 'Liability' || accountType === 'Revenue' || accountType === 'Equity';
    
    // For credit accounts, invert the sign for display purposes
    // Positive balance (normal for credit) should display as negative
    const displayValue = isCreditAccount ? -numValue : numValue;
    const formatted = Math.abs(displayValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    if (showSign) {
      const sign = displayValue >= 0 ? '+' : '-';
      return `${sign}AED ${formatted}`;
    }
    return `AED ${formatted}`;
  }

  formatDate(date: string): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}
