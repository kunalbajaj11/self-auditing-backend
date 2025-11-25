import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

export interface ReportData {
  type: string;
  data: any;
  metadata?: {
    organizationName?: string;
    vatNumber?: string;
    address?: string;
    phone?: string;
    email?: string;
    currency?: string;
    logoUrl?: string;
    generatedAt?: Date;
    generatedBy?: string;
    generatedByName?: string;
    organizationId?: string;
    filters?: Record<string, any>;
    reportPeriod?: {
      startDate?: string;
      endDate?: string;
    };
    summary?: {
      totalExpenses?: number;
      totalAmountBeforeVat?: number;
      totalVatAmount?: number;
      totalAmountAfterVat?: number;
      highestCategorySpend?: { category: string; amount: number };
      topVendor?: { vendor: string; amount: number };
      averageExpenseAmount?: number;
      totalCreditNotes?: number;
      totalAdjustments?: number;
      userWithHighestUploadCount?: { user: string; count: number };
    };
  };
}

@Injectable()
export class ReportGeneratorService {
  private formatCurrency(
    value: number | string,
    currency: string = 'AED',
  ): string {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return `${currency} 0.00`;
    return `${currency} ${numValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }

  private formatDate(dateString: string | Date): string {
    if (!dateString) return '';
    const date =
      typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  async generatePDF(reportData: ReportData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        // Use landscape for wide tables, portrait for summary reports
        const useLandscape = this.shouldUseLandscape(reportData.type);
        const doc = new PDFDocument({
          margin: 50,
          size: 'A4',
          layout: useLandscape ? 'landscape' : 'portrait',
        });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Header with company info (Xero-style)
        this.addPDFHeader(doc, reportData);

        // Report title and period
        doc.moveDown(0.5);
        doc
          .fontSize(18)
          .font('Helvetica-Bold')
          .text(this.getReportTitle(reportData.type), { align: 'center' });
        doc.moveDown(0.3);

        if (
          reportData.metadata?.reportPeriod?.startDate ||
          reportData.metadata?.reportPeriod?.endDate
        ) {
          const period = `${this.formatDate(reportData.metadata.reportPeriod.startDate || '')} to ${this.formatDate(reportData.metadata.reportPeriod.endDate || '')}`;
          doc
            .fontSize(12)
            .font('Helvetica')
            .text(`Period: ${period}`, { align: 'center' });
        }

        doc.moveDown(0.5);

        // Summary section (if available)
        if (reportData.metadata?.summary) {
          this.addPDFSummary(doc, reportData);
          doc.moveDown(0.5);
        }

        // Content based on report type
        this.addPDFContent(doc, reportData);

        // Footer on every page with page numbers
        const pageRange = doc.bufferedPageRange();
        const startPage = pageRange.start;
        const pageCount = pageRange.count;
        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(startPage + i);
          this.addPDFFooter(doc, reportData, i + 1, pageCount);
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private shouldUseLandscape(reportType: string): boolean {
    const landscapeReports = [
      'expense_detail',
      'expense_summary',
      'bank_reconciliation',
      'trial_balance',
    ];
    return landscapeReports.includes(reportType);
  }

  private getReportTitle(reportType: string): string {
    const titles: Record<string, string> = {
      expense_summary: 'Expense Summary Report',
      expense_detail: 'Expense Detail Report',
      vat_report: 'VAT Summary Report',
      bank_reconciliation: 'Bank Reconciliation Summary',
      attachments_report: 'Attachments Report',
      trial_balance: 'Trial Balance',
      audit_trail: 'Transaction Audit Trail',
      vendor_report: 'Vendor Report',
      employee_report: 'Employee Report',
      trend_report: 'Monthly Trend Report',
      accrual_report: 'Accrual Report',
    };
    return (
      titles[reportType] ||
      reportType.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
    );
  }

  private addPDFHeader(doc: PDFKit.PDFDocument, reportData: ReportData): void {
    const pageWidth = doc.page.width;
    const margin = 50;
    const headerBgColor = '#f3f6fa';
    const headerHeight = 120;

    // Header background
    doc
      .rect(margin, 30, pageWidth - 2 * margin, headerHeight)
      .fillColor(headerBgColor)
      .fill();

    // Company logo (left side) - Use application logo by default
    const logoSize = 60;
    const logoX = margin + 10;
    const logoY = 40;

    // Get application logo path (default logo)
    const getApplicationLogoPath = (): string | null => {
      // Try multiple possible paths for the logo
      const possiblePaths = [
        path.join(process.cwd(), 'assets', 'images', 'app-logo.jpg'),
        path.join(
          __dirname,
          '..',
          '..',
          '..',
          'assets',
          'images',
          'app-logo.jpg',
        ),
        path.join(__dirname, '..', '..', 'assets', 'images', 'app-logo.jpg'),
      ];

      for (const logoPath of possiblePaths) {
        if (fs.existsSync(logoPath)) {
          return logoPath;
        }
      }
      return null;
    };

    // Use organization logo if provided, otherwise use application logo
    const logoToUse = reportData.metadata?.logoUrl || getApplicationLogoPath();

    if (logoToUse) {
      try {
        // Try to load and display the logo image
        // PDFKit can handle file paths, URLs, and buffers
        const logoUrl = logoToUse;

        // Check if it's a file path or URL
        if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
          // For HTTP/HTTPS URLs, PDFKit should handle them directly
          doc.image(logoUrl, logoX, logoY, {
            width: logoSize,
            height: logoSize,
            fit: [logoSize, logoSize],
          });
        } else if (fs.existsSync(logoUrl)) {
          // For local file paths
          doc.image(logoUrl, logoX, logoY, {
            width: logoSize,
            height: logoSize,
            fit: [logoSize, logoSize],
          });
        } else {
          // Invalid path/URL, show application name as fallback
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a8a');
          doc.text('selfAccounting.AI', logoX, logoY, { width: logoSize });
        }
      } catch (error) {
        // If logo fails to load, show application name
        console.warn('Failed to load logo:', error);
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a8a');
        doc.text('selfAccounting.AI', logoX, logoY, { width: logoSize });
      }
    } else {
      // No logo available, show application name
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a8a');
      doc.text('selfAccounting.AI', logoX, logoY, { width: logoSize });
    }

    // Company name (to the right of the logo)
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#1e3a8a');
    const orgName = reportData.metadata?.organizationName || 'SmartExpense UAE';
    const leftTextX = logoX + logoSize + 12;
    doc.text(orgName, leftTextX, 40, {
      width: pageWidth / 2 - (leftTextX - margin) - 20,
    });

    // Organization details (left side, under organization name)
    doc.fontSize(9).font('Helvetica').fillColor('#333');
    let yPos = 65;
    if (reportData.metadata?.vatNumber) {
      doc.text(`TRN/VAT: ${reportData.metadata.vatNumber}`, leftTextX, yPos);
      yPos += 12;
    }
    if (reportData.metadata?.address) {
      doc.text(`Address: ${reportData.metadata.address}`, leftTextX, yPos, {
        width: pageWidth / 2 - (leftTextX - margin) - 20,
      });
      yPos += 12;
    }
    if (reportData.metadata?.phone) {
      doc.text(`Phone: ${reportData.metadata.phone}`, leftTextX, yPos);
      yPos += 12;
    }
    if (reportData.metadata?.email) {
      doc.text(`Email: ${reportData.metadata.email}`, leftTextX, yPos);
    }

    // Report title and metadata (right side)
    const rightX = pageWidth / 2 + 20;
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e3a8a');
    doc.text(this.getReportTitle(reportData.type), rightX, 40, {
      width: pageWidth - rightX - margin,
      align: 'right',
    });

    doc.fontSize(9).font('Helvetica').fillColor('#333');
    yPos = 60;
    if (
      reportData.metadata?.reportPeriod?.startDate ||
      reportData.metadata?.reportPeriod?.endDate
    ) {
      const period = `Period: ${this.formatDate(reportData.metadata.reportPeriod.startDate || '')} to ${this.formatDate(reportData.metadata.reportPeriod.endDate || '')}`;
      doc.text(period, rightX, yPos, {
        width: pageWidth - rightX - margin,
        align: 'right',
      });
      yPos += 12;
    }
    if (reportData.metadata?.organizationId) {
      doc.text(
        `Org ID: ${reportData.metadata.organizationId.substring(0, 8)}`,
        rightX,
        yPos,
        { width: pageWidth - rightX - margin, align: 'right' },
      );
      yPos += 12;
    }
    doc.text(
      `Currency: ${reportData.metadata?.currency || 'AED'}`,
      rightX,
      yPos,
      { width: pageWidth - rightX - margin, align: 'right' },
    );
    yPos += 12;

    const generatedDate = reportData.metadata?.generatedAt
      ? new Date(reportData.metadata.generatedAt).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : new Date().toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
    doc.text(`Generated: ${generatedDate}`, rightX, yPos, {
      width: pageWidth - rightX - margin,
      align: 'right',
    });
    yPos += 12;
    if (reportData.metadata?.generatedByName) {
      doc.text(
        `Generated by: ${reportData.metadata.generatedByName}`,
        rightX,
        yPos,
        { width: pageWidth - rightX - margin, align: 'right' },
      );
    }

    // Filters applied (if any)
    if (
      reportData.metadata?.filters &&
      Object.keys(reportData.metadata.filters).length > 0
    ) {
      yPos += 12;
      const filtersText = `Filters: ${Object.entries(
        reportData.metadata.filters,
      )
        .map(
          ([key, value]) =>
            `${key}: ${Array.isArray(value) ? value.join(', ') : value}`,
        )
        .join('; ')}`;
      doc.fontSize(8).fillColor('#666');
      doc.text(filtersText, rightX, yPos, {
        width: pageWidth - rightX - margin,
        align: 'right',
      });
    }

    // Horizontal line below header
    doc
      .moveTo(margin, 30 + headerHeight + 5)
      .lineTo(pageWidth - margin, 30 + headerHeight + 5)
      .strokeColor('#d0d7de')
      .lineWidth(1)
      .stroke();

    // Reset fill color
    doc.fillColor('black');
    doc.y = 30 + headerHeight + 15;
  }

  private addPDFSummary(doc: PDFKit.PDFDocument, reportData: ReportData): void {
    const summary = reportData.metadata?.summary;
    if (!summary) return;

    const pageWidth = doc.page.width;
    const margin = 50;
    const currency = reportData.metadata?.currency || 'AED';
    const period = reportData.metadata?.reportPeriod
      ? `${this.formatDate(reportData.metadata.reportPeriod.startDate || '')} to ${this.formatDate(reportData.metadata.reportPeriod.endDate || '')}`
      : 'All Time';

    // Summary box background
    const summaryStartY = doc.y;
    const summaryHeight = 180;
    doc
      .rect(margin, summaryStartY, pageWidth - 2 * margin, summaryHeight)
      .fillColor('#f9fafb')
      .fill()
      .strokeColor('#d0d7de')
      .lineWidth(1)
      .stroke();

    // Summary title
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e3a8a');
    doc.text(`Summary (Period: ${period})`, margin + 10, summaryStartY + 10);

    // Summary content in two columns
    const leftX = margin + 10;
    const rightX = pageWidth / 2 + 10;
    let yPos = summaryStartY + 35;
    doc.fontSize(10).font('Helvetica').fillColor('#333');

    // Left column
    if (summary.totalExpenses !== undefined) {
      doc.text(
        `Total Number of Expenses: ${summary.totalExpenses}`,
        leftX,
        yPos,
      );
      yPos += 15;
    }
    if (summary.totalAmountBeforeVat !== undefined) {
      doc.text(
        `Total Amount (Before VAT): ${this.formatCurrency(summary.totalAmountBeforeVat, currency)}`,
        leftX,
        yPos,
      );
      yPos += 15;
    }
    if (summary.totalVatAmount !== undefined) {
      doc.text(
        `Total VAT Amount: ${this.formatCurrency(summary.totalVatAmount, currency)}`,
        leftX,
        yPos,
      );
      yPos += 15;
    }
    if (summary.totalAmountAfterVat !== undefined) {
      doc.font('Helvetica-Bold');
      doc.text(
        `Total Amount (After VAT): ${this.formatCurrency(summary.totalAmountAfterVat, currency)}`,
        leftX,
        yPos,
      );
      doc.font('Helvetica');
      yPos += 15;
    }
    if (summary.averageExpenseAmount !== undefined) {
      doc.text(
        `Average Expense Amount: ${this.formatCurrency(summary.averageExpenseAmount, currency)}`,
        leftX,
        yPos,
      );
      yPos += 15;
    }

    // Right column
    yPos = summaryStartY + 35;
    if (summary.highestCategorySpend) {
      doc.text(
        `Highest Category Spend: ${summary.highestCategorySpend.category} (${this.formatCurrency(summary.highestCategorySpend.amount, currency)})`,
        rightX,
        yPos,
      );
      yPos += 15;
    }
    if (summary.topVendor) {
      doc.text(
        `Top Vendor: ${summary.topVendor.vendor} (${this.formatCurrency(summary.topVendor.amount, currency)})`,
        rightX,
        yPos,
      );
      yPos += 15;
    }
    if (summary.totalCreditNotes !== undefined) {
      doc.text(`Total Credit Notes: ${summary.totalCreditNotes}`, rightX, yPos);
      yPos += 15;
    }
    if (summary.totalAdjustments !== undefined) {
      doc.text(`Total Adjustments: ${summary.totalAdjustments}`, rightX, yPos);
      yPos += 15;
    }
    if (summary.userWithHighestUploadCount) {
      doc.text(
        `User with Highest Upload Count: ${summary.userWithHighestUploadCount.user} (${summary.userWithHighestUploadCount.count} uploads)`,
        rightX,
        yPos,
      );
    }

    // Reset fill color and update position
    doc.fillColor('black');
    doc.y = summaryStartY + summaryHeight + 10;
  }

  private addPDFFooter(
    doc: PDFKit.PDFDocument,
    reportData: ReportData,
    pageNumber?: number,
    totalPages?: number,
  ): void {
    const pageHeight = doc.page.height;
    const pageWidth = doc.page.width;
    const margin = 50;
    const footerY = pageHeight - 35;

    // Footer line
    doc
      .moveTo(margin, footerY - 5)
      .lineTo(pageWidth - margin, footerY - 5)
      .strokeColor('#e0e0e0')
      .lineWidth(0.5)
      .stroke();

    doc.fontSize(8).font('Helvetica').fillColor('#666');

    // Left side: Disclaimer and branding
    const disclaimer =
      'This is a system-generated report, no signature required.';
    doc.text(disclaimer, margin, footerY, {
      align: 'left',
    });
    doc.text('Generated by SelfAccounting.AI', margin, footerY + 10, {
      align: 'left',
    });

    // Right side: Page numbers and date
    if (pageNumber !== undefined && totalPages !== undefined) {
      const pageText = `Page ${pageNumber} of ${totalPages}`;
      const pageTextWidth = doc.widthOfString(pageText);
      doc.text(pageText, pageWidth - margin - pageTextWidth, footerY);
    }

    const footerDate = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const dateTextWidth = doc.widthOfString(footerDate);
    doc.text(footerDate, pageWidth - margin - dateTextWidth, footerY + 10);

    // Reset fill color
    doc.fillColor('black');
  }

  async generateXLSX(reportData: ReportData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SmartExpense UAE';
    workbook.created = new Date();

    const currency = reportData.metadata?.currency || 'AED';

    // Create main summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    this.addXLSXHeader(summarySheet, reportData);

    // Add content based on report type with multiple tabs
    if (
      reportData.type === 'vat_report' &&
      typeof reportData.data === 'object'
    ) {
      // VAT Report with multiple tabs
      this.addXLSXVATReport(workbook, reportData, currency);
    } else if (
      reportData.type === 'bank_reconciliation' &&
      typeof reportData.data === 'object'
    ) {
      // Bank Reconciliation with multiple tabs
      this.addXLSXBankReconciliation(workbook, reportData, currency);
    } else if (
      reportData.type === 'trial_balance' &&
      typeof reportData.data === 'object'
    ) {
      // Trial Balance with summary and accounts
      this.addXLSXTrialBalance(workbook, reportData, currency);
    } else if (
      (reportData.type === 'expense_summary' ||
        reportData.type === 'expense_detail') &&
      Array.isArray(reportData.data)
    ) {
      // Expense reports with enhanced features
      this.addXLSXExpenseReport(workbook, reportData, currency);
    } else {
      // Standard report with single sheet
      this.addXLSXContent(summarySheet, reportData, currency);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private addXLSXExpenseReport(
    workbook: ExcelJS.Workbook,
    reportData: ReportData,
    currency: string,
  ): void {
    const data = reportData.data as any[];
    if (!data || data.length === 0) {
      let sheet = workbook.getWorksheet('Summary');
      if (!sheet) {
        sheet = workbook.addWorksheet('Summary');
      }
      this.addXLSXHeader(sheet, reportData);
      sheet.addRow(['No data available.']);
      return;
    }

    // Main expense sheet
    const expenseSheet =
      workbook.getWorksheet('Summary') || workbook.addWorksheet('Summary');
    this.addXLSXHeader(expenseSheet, reportData);

    // Add summary section if available
    if (reportData.metadata?.summary) {
      const summary = reportData.metadata.summary;
      expenseSheet.addRow(['Summary']);
      expenseSheet.getRow(expenseSheet.rowCount).font = {
        bold: true,
        size: 12,
      };
      expenseSheet.addRow(['Total Expenses', summary.totalExpenses || 0]);
      expenseSheet.addRow([
        'Total Amount (Before VAT)',
        summary.totalAmountBeforeVat || 0,
      ]);
      expenseSheet.addRow(['Total VAT Amount', summary.totalVatAmount || 0]);
      expenseSheet.addRow([
        'Total Amount (After VAT)',
        summary.totalAmountAfterVat || 0,
      ]);
      expenseSheet.addRow([
        'Average Expense Amount',
        summary.averageExpenseAmount || 0,
      ]);
      expenseSheet.addRow([]);
    }

    // Headers
    const headers = Object.keys(data[0]);
    const formattedHeaders = headers.map((h) => this.formatHeaderLabel(h));
    expenseSheet.addRow(formattedHeaders);
    const headerRow = expenseSheet.getRow(expenseSheet.rowCount);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1e3a8a' },
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };

    // Data rows
    data.forEach((row: any, index: number) => {
      const values = headers.map((h) => {
        const value = row[h];
        const currencyFields = [
          'amount',
          'vat',
          'total',
          'totalAmount',
          'vatAmount',
          'baseAmount',
        ];
        if (currencyFields.some((field) => h.toLowerCase().includes(field))) {
          const numValue =
            typeof value === 'string' ? parseFloat(value) : value;
          return isNaN(numValue) ? 0 : numValue;
        }
        return value ?? '';
      });
      const dataRow = expenseSheet.addRow(values);

      // Alternate row colors
      if (index % 2 === 0) {
        dataRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' },
        };
      }

      // Format currency columns
      headers.forEach((header, colIndex) => {
        const cell = dataRow.getCell(colIndex + 1);
        const currencyFields = [
          'amount',
          'vat',
          'total',
          'totalAmount',
          'vatAmount',
          'baseAmount',
        ];
        if (
          currencyFields.some((field) => header.toLowerCase().includes(field))
        ) {
          cell.numFmt = `"${currency}" #,##0.00`;
          cell.alignment = { horizontal: 'right' };
        } else if (header.toLowerCase().includes('date')) {
          cell.numFmt = 'dd-mmm-yyyy';
          cell.alignment = { horizontal: 'center' };
        }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
      });
    });

    // Freeze header row
    expenseSheet.views = [
      {
        state: 'frozen',
        ySplit: expenseSheet.rowCount - data.length, // Freeze at header row
      },
    ];

    // Auto-filter
    expenseSheet.autoFilter = {
      from: {
        row: expenseSheet.rowCount - data.length,
        column: 1,
      },
      to: {
        row: expenseSheet.rowCount,
        column: headers.length,
      },
    };

    // Conditional formatting for VAT > 0
    const vatColIndex = headers.findIndex((h) =>
      h.toLowerCase().includes('vat'),
    );
    if (vatColIndex >= 0) {
      expenseSheet.addConditionalFormatting({
        ref: `${String.fromCharCode(65 + vatColIndex)}${expenseSheet.rowCount - data.length + 1}:${String.fromCharCode(65 + vatColIndex)}${expenseSheet.rowCount}`,
        rules: [
          {
            type: 'cellIs',
            operator: 'greaterThan',
            formulae: [0],
            priority: 1,
            style: {
              fill: {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFE5E5' },
              },
            },
          },
        ],
      });
    }

    // Auto-fit columns
    expenseSheet.columns.forEach((column, index) => {
      if (column.header) {
        const headerLength = formattedHeaders[index]?.length || 10;
        column.width = Math.max(headerLength + 2, 12);
      }
    });

    // Add pivot sheets
    this.addXLSXPivotSheets(workbook, data, currency);
  }

  private addXLSXPivotSheets(
    workbook: ExcelJS.Workbook,
    data: any[],
    currency: string,
  ): void {
    // Category Summary Sheet
    const categorySheet = workbook.addWorksheet('Category Summary');
    categorySheet.addRow(['Category', 'Count', 'Amount', 'VAT', 'Total']);
    const categoryHeaderRow = categorySheet.getRow(1);
    categoryHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    categoryHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1e3a8a' },
    };

    const categoryMap = new Map<
      string,
      { count: number; amount: number; vat: number; total: number }
    >();
    data.forEach((row: any) => {
      const category = row.category || 'Uncategorized';
      const amount = row.amount || row.baseAmount || 0;
      const vat = row.vat || row.vatAmount || 0;
      const total = row.total || row.totalAmount || 0;
      if (!categoryMap.has(category)) {
        categoryMap.set(category, { count: 0, amount: 0, vat: 0, total: 0 });
      }
      const cat = categoryMap.get(category)!;
      cat.count++;
      cat.amount += amount;
      cat.vat += vat;
      cat.total += total;
    });

    categoryMap.forEach((value, category) => {
      categorySheet.addRow([
        category,
        value.count,
        value.amount,
        value.vat,
        value.total,
      ]);
    });

    // Format currency columns
    ['C', 'D', 'E'].forEach((col) => {
      categorySheet.getColumn(col).numFmt = `"${currency}" #,##0.00`;
      categorySheet.getColumn(col).alignment = { horizontal: 'right' };
    });

    // Vendor Summary Sheet
    const vendorSheet = workbook.addWorksheet('Vendor Summary');
    vendorSheet.addRow(['Vendor', 'Count', 'Amount', 'VAT', 'Total']);
    const vendorHeaderRow = vendorSheet.getRow(1);
    vendorHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    vendorHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1e3a8a' },
    };

    const vendorMap = new Map<
      string,
      { count: number; amount: number; vat: number; total: number }
    >();
    data.forEach((row: any) => {
      const vendor = row.vendor || 'N/A';
      const amount = row.amount || row.baseAmount || 0;
      const vat = row.vat || row.vatAmount || 0;
      const total = row.total || row.totalAmount || 0;
      if (!vendorMap.has(vendor)) {
        vendorMap.set(vendor, { count: 0, amount: 0, vat: 0, total: 0 });
      }
      const ven = vendorMap.get(vendor)!;
      ven.count++;
      ven.amount += amount;
      ven.vat += vat;
      ven.total += total;
    });

    vendorMap.forEach((value, vendor) => {
      vendorSheet.addRow([
        vendor,
        value.count,
        value.amount,
        value.vat,
        value.total,
      ]);
    });

    // Format currency columns
    ['C', 'D', 'E'].forEach((col) => {
      vendorSheet.getColumn(col).numFmt = `"${currency}" #,##0.00`;
      vendorSheet.getColumn(col).alignment = { horizontal: 'right' };
    });

    // Monthly Breakdown Sheet
    const monthlySheet = workbook.addWorksheet('Monthly Breakdown');
    monthlySheet.addRow(['Month', 'Total Spend', 'VAT']);
    const monthlyHeaderRow = monthlySheet.getRow(1);
    monthlyHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    monthlyHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1e3a8a' },
    };

    const monthlyMap = new Map<string, { spend: number; vat: number }>();
    data.forEach((row: any) => {
      const date = row.date || row.expenseDate;
      if (date) {
        const month = new Date(date).toLocaleDateString('en-GB', {
          month: 'short',
          year: 'numeric',
        });
        const total = row.total || row.totalAmount || 0;
        const vat = row.vat || row.vatAmount || 0;
        if (!monthlyMap.has(month)) {
          monthlyMap.set(month, { spend: 0, vat: 0 });
        }
        const mon = monthlyMap.get(month)!;
        mon.spend += total;
        mon.vat += vat;
      }
    });

    // Sort by month
    const sortedMonths = Array.from(monthlyMap.entries()).sort((a, b) => {
      return new Date(a[0]).getTime() - new Date(b[0]).getTime();
    });

    sortedMonths.forEach(([month, value]) => {
      monthlySheet.addRow([month, value.spend, value.vat]);
    });

    // Format currency columns
    ['B', 'C'].forEach((col) => {
      monthlySheet.getColumn(col).numFmt = `"${currency}" #,##0.00`;
      monthlySheet.getColumn(col).alignment = { horizontal: 'right' };
    });

    // Auto-fit columns for all pivot sheets
    [categorySheet, vendorSheet, monthlySheet].forEach((sheet) => {
      sheet.columns.forEach((column) => {
        if (column.header) {
          column.width = Math.max(15, column.header.length + 2);
        }
      });
    });
  }

  async generateCSV(reportData: ReportData): Promise<Buffer> {
    const lines: string[] = [];

    // Header information
    lines.push(reportData.metadata?.organizationName || 'SmartExpense UAE');
    lines.push(this.getReportTitle(reportData.type));

    if (
      reportData.metadata?.reportPeriod?.startDate ||
      reportData.metadata?.reportPeriod?.endDate
    ) {
      const period = `Period: ${this.formatDate(reportData.metadata.reportPeriod.startDate || '')} to ${this.formatDate(reportData.metadata.reportPeriod.endDate || '')}`;
      lines.push(period);
    }

    if (reportData.metadata?.vatNumber) {
      lines.push(`VAT Number: ${reportData.metadata.vatNumber}`);
    }

    const generatedDate = reportData.metadata?.generatedAt
      ? this.formatDate(reportData.metadata.generatedAt)
      : new Date().toLocaleDateString('en-GB');
    lines.push(`Generated: ${generatedDate}`);
    lines.push('');

    // Add content based on report type
    this.addCSVContent(lines, reportData);

    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  private addPDFContent(doc: PDFKit.PDFDocument, reportData: ReportData): void {
    const data = reportData.data;
    const currency = reportData.metadata?.currency || 'AED';

    if (Array.isArray(data)) {
      // Table format with enhanced styling
      if (data.length === 0) {
        doc
          .fontSize(12)
          .font('Helvetica')
          .text('No data available.', { align: 'center' });
        return;
      }

      // Get headers and format them (restrict for specific report types)
      const headers = this.getColumnsForReport(reportData.type, data[0]);
      const pageWidth = doc.page.width;
      const margin = 50;
      const availableWidth = pageWidth - 2 * margin;
      const colWidth = availableWidth / headers.length;

      // Table header with background
      const headerY = doc.y;
      doc
        .rect(margin, headerY, availableWidth, 25)
        .fillColor('#f3f6fa')
        .fill()
        .strokeColor('#d0d7de')
        .stroke();

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a8a');
      let x = margin + 5;
      headers.forEach((header) => {
        const headerLabel = this.formatHeaderLabel(header);
        doc.text(headerLabel, x, headerY + 8, {
          width: colWidth - 10,
          align: this.getColumnAlignment(header),
        });
        x += colWidth;
      });
      doc.fillColor('black');

      // Data rows with alternating colors
      let rowY = headerY + 25;
      data.forEach((row: any, index: number) => {
        // Check if we need a new page
        if (rowY > doc.page.height - 80) {
          doc.addPage();
          this.addPDFHeader(doc, reportData);
          rowY = doc.y;
          // Redraw header on new page
          doc
            .rect(margin, rowY, availableWidth, 25)
            .fillColor('#f3f6fa')
            .fill()
            .strokeColor('#d0d7de')
            .stroke();
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a8a');
          x = margin + 5;
          headers.forEach((header) => {
            const headerLabel = this.formatHeaderLabel(header);
            doc.text(headerLabel, x, rowY + 8, {
              width: colWidth - 10,
              align: this.getColumnAlignment(header),
            });
            x += colWidth;
          });
          doc.fillColor('black');
          rowY += 25;
        }

        // Alternate row background
        if (index % 2 === 0) {
          doc
            .rect(margin, rowY, availableWidth, 20)
            .fillColor('#f9fafb')
            .fill();
        }

        doc.fontSize(9).font('Helvetica').fillColor('black');
        x = margin + 5;
        headers.forEach((header) => {
          const value = this.formatCellValue(row[header], header, currency);
          doc.text(value, x, rowY + 5, {
            width: colWidth - 10,
            align: this.getColumnAlignment(header),
            lineBreak: false,
            ellipsis: true,
          });
          x += colWidth;
        });
        rowY += 20;
      });

      // Total row if applicable
      if (this.shouldShowTotal(reportData.type) && data.length > 0) {
        const totalRow = this.calculateTotalRow(data, headers, currency);
        rowY += 5;
        doc
          .rect(margin, rowY, availableWidth, 25)
          .fillColor('#e8eef5')
          .fill()
          .strokeColor('#d0d7de')
          .stroke();

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a8a');
        x = margin + 5;
        headers.forEach((header) => {
          const value = totalRow[header] || '';
          doc.text(value, x, rowY + 8, {
            width: colWidth - 10,
            align: this.getColumnAlignment(header),
          });
          x += colWidth;
        });
        doc.fillColor('black');
      }

      doc.y = rowY + 30;
    } else if (typeof data === 'object' && data !== null) {
      // Handle structured reports (VAT, Bank Reconciliation, etc.)
      this.addPDFStructuredContent(doc, reportData, data, currency);
    } else {
      doc.fontSize(12).font('Helvetica').text(String(data));
    }
  }

  private getColumnsForReport(
    reportType: string,
    sampleRow: Record<string, any>,
  ): string[] {
    const allHeaders = Object.keys(sampleRow || {});
    if (allHeaders.length === 0) return allHeaders;

    // Preferred minimal columns for expense reports to avoid overflow
    if (reportType === 'expense_summary' || reportType === 'expense_detail') {
      // Exclude fields we don't want in PDF (e.g., notes)
      const filteredHeaders = allHeaders.filter(
        (h) => h.toLowerCase() !== 'notes',
      );
      const normalized = new Set(filteredHeaders.map((h) => h.toLowerCase()));
      // Pick only the first matching alias for amount/vat/total and date/type/vendor fields
      const pick = (candidates: string[]): string | undefined =>
        candidates.find((c) => normalized.has(c.toLowerCase()));
      const selected: string[] = [];
      const pushIf = (c: string | undefined) => {
        if (c && !selected.includes(c)) selected.push(c);
      };
      pushIf(pick(['date', 'expenseDate']));
      pushIf(pick(['category']));
      pushIf(pick(['type', 'expenseType']));
      pushIf(pick(['vendor', 'vendorName']));
      pushIf(pick(['amount', 'baseAmount']));
      pushIf(pick(['vat', 'vatAmount']));
      pushIf(pick(['total', 'totalAmount']));
      pushIf(pick(['currency']));
      pushIf(pick(['status']));

      // Fallback: if somehow we got fewer than 4 columns, include remaining up to 6 columns max
      if (selected.length < 4) {
        for (const h of filteredHeaders) {
          if (selected.length >= 6) break;
          if (!selected.includes(h)) selected.push(h);
        }
      }
      return selected;
    }

    return allHeaders;
  }

  private formatHeaderLabel(header: string): string {
    return header
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }

  private formatCellValue(
    value: any,
    header: string,
    currency: string,
  ): string {
    if (value === null || value === undefined) return '';

    // Format currency fields
    const currencyFields = [
      'amount',
      'vat',
      'total',
      'totalAmount',
      'vatAmount',
      'debit',
      'credit',
      'balance',
      'taxableAmount',
      'inputVat',
      'outputVat',
      'netVatPayable',
    ];
    if (currencyFields.some((field) => header.toLowerCase().includes(field))) {
      const numValue = typeof value === 'string' ? parseFloat(value) : value;
      if (!isNaN(numValue)) {
        return this.formatCurrency(numValue, currency);
      }
    }

    // Format dates
    if (header.toLowerCase().includes('date') && value) {
      return this.formatDate(value);
    }

    // Format arrays (like attachments)
    if (Array.isArray(value)) {
      return value.length > 0 ? `${value.length} item(s)` : 'None';
    }

    return String(value);
  }

  private getColumnAlignment(header: string): 'left' | 'right' | 'center' {
    const rightAlignFields = [
      'amount',
      'vat',
      'total',
      'totalAmount',
      'vatAmount',
      'debit',
      'credit',
      'balance',
      'price',
      'cost',
    ];
    if (
      rightAlignFields.some((field) => header.toLowerCase().includes(field))
    ) {
      return 'right';
    }
    if (
      header.toLowerCase().includes('date') ||
      header.toLowerCase().includes('id')
    ) {
      return 'center';
    }
    return 'left';
  }

  private shouldShowTotal(reportType: string): boolean {
    return [
      'expense_summary',
      'expense_detail',
      'vendor_report',
      'employee_report',
    ].includes(reportType);
  }

  private calculateTotalRow(
    data: any[],
    headers: string[],
    currency: string,
  ): Record<string, string> {
    const totalRow: Record<string, string> = {};
    headers.forEach((header) => {
      const currencyFields = [
        'amount',
        'vat',
        'total',
        'totalAmount',
        'vatAmount',
      ];
      if (
        currencyFields.some((field) => header.toLowerCase().includes(field))
      ) {
        const sum = data.reduce((acc, row) => {
          const val =
            typeof row[header] === 'string'
              ? parseFloat(row[header])
              : row[header];
          return acc + (isNaN(val) ? 0 : val);
        }, 0);
        totalRow[header] = this.formatCurrency(sum, currency);
      } else if (
        header.toLowerCase() === 'date' ||
        header.toLowerCase().includes('id')
      ) {
        totalRow[header] = '';
      } else {
        totalRow[header] = 'Total';
      }
    });
    return totalRow;
  }

  private addPDFStructuredContent(
    doc: PDFKit.PDFDocument,
    reportData: ReportData,
    data: any,
    currency: string,
  ): void {
    // Handle VAT Report
    if (reportData.type === 'vat_report') {
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('VAT Summary', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica');

      if (data.taxableSupplies !== undefined) {
        doc.text(
          `Taxable Supplies: ${this.formatCurrency(data.taxableSupplies, currency)}`,
        );
      }
      if (data.inputVat !== undefined) {
        doc.text(`Input VAT: ${this.formatCurrency(data.inputVat, currency)}`);
      }
      if (data.outputVat !== undefined) {
        doc.text(
          `Output VAT: ${this.formatCurrency(data.outputVat, currency)}`,
        );
      }
      if (data.netVatPayable !== undefined) {
        doc.font('Helvetica-Bold');
        doc.text(
          `Net VAT Payable: ${this.formatCurrency(data.netVatPayable, currency)}`,
        );
        doc.font('Helvetica');
      }
      if (data.status) {
        doc.text(`Status: ${data.status}`);
      }

      if (
        data.categoryBreakdown &&
        Array.isArray(data.categoryBreakdown) &&
        data.categoryBreakdown.length > 0
      ) {
        doc.moveDown(0.5);
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('Category Breakdown', { underline: true });
        doc.moveDown(0.3);
        // Add category breakdown table
        this.addPDFTable(
          doc,
          data.categoryBreakdown,
          ['category', 'taxableAmount', 'vatAmount', 'totalAmount'],
          currency,
        );
      }
    }
    // Handle Bank Reconciliation
    else if (reportData.type === 'bank_reconciliation') {
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('Reconciliation Summary', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica');
      doc.text(`Reconciliation ID: ${data.reconciliationId || 'N/A'}`);
      doc.text(
        `Date Range: ${this.formatDate(data.dateRange?.startDate || '')} to ${this.formatDate(data.dateRange?.endDate || '')}`,
      );
      doc.text(`Total Transactions: ${data.totalTransactions || 0}`);
      doc.text(`Matched: ${data.matched || 0}`);
      doc.text(`Unmatched: ${data.unmatched || 0}`);
      doc.font('Helvetica-Bold');
      doc.text(
        `Variance: ${this.formatCurrency(data.variance || 0, currency)}`,
      );
      doc.font('Helvetica');

      if (
        data.transactions &&
        Array.isArray(data.transactions) &&
        data.transactions.length > 0
      ) {
        doc.moveDown(0.5);
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('Transactions', { underline: true });
        doc.moveDown(0.3);
        this.addPDFTable(
          doc,
          data.transactions,
          ['date', 'description', 'amount', 'status'],
          currency,
        );
      }
    }
    // Handle Trial Balance
    else if (reportData.type === 'trial_balance') {
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('Trial Balance Summary', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica');
      if (data.summary) {
        doc.text(
          `Total Debit: ${this.formatCurrency(data.summary.totalDebit || 0, currency)}`,
        );
        doc.text(
          `Total Credit: ${this.formatCurrency(data.summary.totalCredit || 0, currency)}`,
        );
        doc.font('Helvetica-Bold');
        doc.text(
          `Total Balance: ${this.formatCurrency(data.summary.totalBalance || 0, currency)}`,
        );
        doc.font('Helvetica');
      }

      if (
        data.accounts &&
        Array.isArray(data.accounts) &&
        data.accounts.length > 0
      ) {
        doc.moveDown(0.5);
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('Accounts', { underline: true });
        doc.moveDown(0.3);
        this.addPDFTable(
          doc,
          data.accounts,
          ['accountName', 'accountType', 'debit', 'credit', 'balance'],
          currency,
        );
      }
    }
    // Default object display
    else {
      Object.entries(data).forEach(([key, value]) => {
        if (
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value)
        ) {
          doc.fontSize(12).font('Helvetica-Bold').text(key);
          doc.font('Helvetica').fontSize(10);
          Object.entries(value).forEach(([subKey, subValue]) => {
            doc.text(`  ${subKey}: ${String(subValue)}`);
          });
        } else {
          doc.fontSize(11).text(`${key}: ${String(value)}`);
        }
      });
    }
  }

  private addPDFTable(
    doc: PDFKit.PDFDocument,
    data: any[],
    columns: string[],
    currency: string,
  ): void {
    if (data.length === 0) return;

    const pageWidth = doc.page.width;
    const margin = 50;
    const availableWidth = pageWidth - 2 * margin;
    const colWidth = availableWidth / columns.length;

    // Header
    const headerY = doc.y;
    doc
      .rect(margin, headerY, availableWidth, 25)
      .fillColor('#f3f6fa')
      .fill()
      .strokeColor('#d0d7de')
      .stroke();

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a8a');
    let x = margin + 5;
    columns.forEach((col) => {
      doc.text(this.formatHeaderLabel(col), x, headerY + 8, {
        width: colWidth - 10,
        align: this.getColumnAlignment(col),
      });
      x += colWidth;
    });
    doc.fillColor('black');

    // Rows
    let rowY = headerY + 25;
    data.forEach((row: any, index: number) => {
      if (rowY > doc.page.height - 80) {
        doc.addPage();
        this.addPDFHeader(doc, { type: '', data: {}, metadata: {} });
        rowY = doc.y;
        // Redraw header
        doc
          .rect(margin, rowY, availableWidth, 25)
          .fillColor('#f3f6fa')
          .fill()
          .strokeColor('#d0d7de')
          .stroke();
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a8a');
        x = margin + 5;
        columns.forEach((col) => {
          doc.text(this.formatHeaderLabel(col), x, rowY + 8, {
            width: colWidth - 10,
            align: this.getColumnAlignment(col),
          });
          x += colWidth;
        });
        doc.fillColor('black');
        rowY += 25;
      }

      if (index % 2 === 0) {
        doc.rect(margin, rowY, availableWidth, 20).fillColor('#f9fafb').fill();
      }

      doc.fontSize(9).font('Helvetica');
      x = margin + 5;
      columns.forEach((col) => {
        const value = this.formatCellValue(row[col], col, currency);
        doc.text(value, x, rowY + 5, {
          width: colWidth - 10,
          align: this.getColumnAlignment(col),
          lineBreak: false,
          ellipsis: true,
        });
        x += colWidth;
      });
      rowY += 20;
    });

    doc.y = rowY + 10;
  }

  private addXLSXHeader(
    worksheet: ExcelJS.Worksheet,
    reportData: ReportData,
  ): void {
    // Company header
    worksheet.addRow([
      reportData.metadata?.organizationName || 'SmartExpense UAE',
    ]);
    worksheet.mergeCells(`A1:D1`);
    const headerCell = worksheet.getCell('A1');
    headerCell.font = { size: 16, bold: true, color: { argb: 'FF1e3a8a' } };
    headerCell.alignment = { horizontal: 'left', vertical: 'middle' };

    // Report title
    worksheet.addRow([this.getReportTitle(reportData.type)]);
    worksheet.mergeCells(`A2:D2`);
    const titleCell = worksheet.getCell('A2');
    titleCell.font = { size: 14, bold: true };
    titleCell.alignment = { horizontal: 'left' };

    // Period
    if (
      reportData.metadata?.reportPeriod?.startDate ||
      reportData.metadata?.reportPeriod?.endDate
    ) {
      const period = `Period: ${this.formatDate(reportData.metadata.reportPeriod.startDate || '')} to ${this.formatDate(reportData.metadata.reportPeriod.endDate || '')}`;
      worksheet.addRow([period]);
      worksheet.mergeCells(`A3:D3`);
    }

    // Organization details
    let rowNum = 4;
    if (reportData.metadata?.vatNumber) {
      worksheet.addRow([`VAT Number: ${reportData.metadata.vatNumber}`]);
      worksheet.mergeCells(`A${rowNum}:D${rowNum}`);
      rowNum++;
    }
    if (reportData.metadata?.address) {
      worksheet.addRow([`Address: ${reportData.metadata.address}`]);
      worksheet.mergeCells(`A${rowNum}:D${rowNum}`);
      rowNum++;
    }

    // Generated date
    const generatedDate = reportData.metadata?.generatedAt
      ? this.formatDate(reportData.metadata.generatedAt)
      : new Date().toLocaleDateString('en-GB');
    worksheet.addRow([`Generated: ${generatedDate}`]);
    worksheet.mergeCells(`A${rowNum}:D${rowNum}`);

    worksheet.addRow([]); // Empty row
  }

  private addXLSXContent(
    worksheet: ExcelJS.Worksheet,
    reportData: ReportData,
    currency: string,
  ): void {
    const data = reportData.data;

    if (Array.isArray(data)) {
      if (data.length === 0) {
        worksheet.addRow(['No data available.']);
        return;
      }

      // Headers
      const headers = Object.keys(data[0]);
      const formattedHeaders = headers.map((h) => this.formatHeaderLabel(h));
      worksheet.addRow(formattedHeaders);
      const headerRow = worksheet.getRow(worksheet.rowCount);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F6FA' },
      };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
      headerRow.border = {
        top: { style: 'thin', color: { argb: 'FFD0D7DE' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D7DE' } },
        left: { style: 'thin', color: { argb: 'FFD0D7DE' } },
        right: { style: 'thin', color: { argb: 'FFD0D7DE' } },
      };

      // Data rows with formatting
      data.forEach((row: any, index: number) => {
        const values = headers.map((h) => {
          const value = row[h];
          // Format currency values
          const currencyFields = [
            'amount',
            'vat',
            'total',
            'totalAmount',
            'vatAmount',
            'debit',
            'credit',
            'balance',
          ];
          if (currencyFields.some((field) => h.toLowerCase().includes(field))) {
            const numValue =
              typeof value === 'string' ? parseFloat(value) : value;
            return isNaN(numValue) ? 0 : numValue;
          }
          return value ?? '';
        });
        const dataRow = worksheet.addRow(values);

        // Alternate row colors
        if (index % 2 === 0) {
          dataRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF9FAFB' },
          };
        }

        // Format currency columns
        headers.forEach((header, colIndex) => {
          const cell = dataRow.getCell(colIndex + 1);
          const currencyFields = [
            'amount',
            'vat',
            'total',
            'totalAmount',
            'vatAmount',
            'debit',
            'credit',
            'balance',
          ];
          if (
            currencyFields.some((field) => header.toLowerCase().includes(field))
          ) {
            cell.numFmt = `"${currency}" #,##0.00`;
            cell.alignment = { horizontal: 'right' };
          } else if (header.toLowerCase().includes('date')) {
            cell.numFmt = 'dd-mmm-yyyy';
            cell.alignment = { horizontal: 'center' };
          }
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          };
        });
      });

      // Total row if applicable
      if (this.shouldShowTotal(reportData.type) && data.length > 0) {
        const totalRow = this.calculateTotalRow(data, headers, currency);
        const totalValues = headers.map((h) => {
          const currencyFields = [
            'amount',
            'vat',
            'total',
            'totalAmount',
            'vatAmount',
          ];
          if (currencyFields.some((field) => h.toLowerCase().includes(field))) {
            const val = totalRow[h];
            return typeof val === 'string'
              ? parseFloat(val.replace(/[^\d.-]/g, ''))
              : val;
          }
          return totalRow[h] || '';
        });
        const totalDataRow = worksheet.addRow(totalValues);
        totalDataRow.font = { bold: true, color: { argb: 'FF1e3a8a' } };
        totalDataRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE8EEF5' },
        };

        headers.forEach((header, colIndex) => {
          const cell = totalDataRow.getCell(colIndex + 1);
          const currencyFields = [
            'amount',
            'vat',
            'total',
            'totalAmount',
            'vatAmount',
          ];
          if (
            currencyFields.some((field) => header.toLowerCase().includes(field))
          ) {
            cell.numFmt = `"${currency}" #,##0.00`;
            cell.alignment = { horizontal: 'right' };
          }
        });
      }

      // Auto-fit columns
      worksheet.columns.forEach((column, index) => {
        if (column.header) {
          const headerLength = formattedHeaders[index]?.length || 10;
          column.width = Math.max(headerLength + 2, 12);
        }
      });
    } else if (typeof data === 'object') {
      worksheet.addRow(['Key', 'Value']);
      const headerRow = worksheet.getRow(worksheet.rowCount);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F6FA' },
      };

      Object.entries(data).forEach(([key, value]) => {
        worksheet.addRow([key, String(value)]);
      });
    }
  }

  private addXLSXVATReport(
    workbook: ExcelJS.Workbook,
    reportData: ReportData,
    currency: string,
  ): void {
    const data = reportData.data;

    // Summary sheet
    const summarySheet =
      workbook.getWorksheet('Summary') || workbook.addWorksheet('Summary');
    this.addXLSXHeader(summarySheet, reportData);

    summarySheet.addRow(['VAT Summary']);
    summarySheet.addRow([
      'Taxable Supplies',
      data.taxableSupplies || data.taxableAmount || 0,
    ]);
    summarySheet.addRow(['Input VAT', data.inputVat || data.vatAmount || 0]);
    summarySheet.addRow(['Output VAT', data.outputVat || 0]);
    summarySheet.addRow(['Net VAT Payable', data.netVatPayable || 0]);
    summarySheet.addRow(['Status', data.status || 'Pending']);

    // Format currency cells
    [2, 3, 4, 5].forEach((rowNum) => {
      const cell = summarySheet.getCell(`B${rowNum}`);
      cell.numFmt = `"${currency}" #,##0.00`;
    });

    // Category Breakdown sheet
    if (
      data.categoryBreakdown &&
      Array.isArray(data.categoryBreakdown) &&
      data.categoryBreakdown.length > 0
    ) {
      const categorySheet = workbook.addWorksheet('Category Breakdown');
      categorySheet.addRow([
        'Category',
        'Taxable Amount',
        'VAT Amount',
        'Total Amount',
      ]);
      const headerRow = categorySheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F6FA' },
      };

      data.categoryBreakdown.forEach((item: any) => {
        categorySheet.addRow([
          item.category,
          item.taxableAmount || 0,
          item.vatAmount || 0,
          item.totalAmount || 0,
        ]);
      });

      // Format currency columns
      ['B', 'C', 'D'].forEach((col) => {
        categorySheet.getColumn(col).numFmt = `"${currency}" #,##0.00`;
        categorySheet.getColumn(col).alignment = { horizontal: 'right' };
      });

      categorySheet.getColumn('A').width = 20;
      ['B', 'C', 'D'].forEach((col) => {
        categorySheet.getColumn(col).width = 18;
      });
    }
  }

  private addXLSXBankReconciliation(
    workbook: ExcelJS.Workbook,
    reportData: ReportData,
    currency: string,
  ): void {
    const data = reportData.data;

    // Summary sheet
    const summarySheet =
      workbook.getWorksheet('Summary') || workbook.addWorksheet('Summary');
    this.addXLSXHeader(summarySheet, reportData);

    summarySheet.addRow(['Reconciliation Summary']);
    summarySheet.addRow(['Reconciliation ID', data.reconciliationId || 'N/A']);
    summarySheet.addRow(['Total Transactions', data.totalTransactions || 0]);
    summarySheet.addRow(['Matched', data.matched || 0]);
    summarySheet.addRow(['Unmatched', data.unmatched || 0]);
    summarySheet.addRow(['Variance', data.variance || 0]);

    const varianceCell = summarySheet.getCell('B6');
    varianceCell.numFmt = `"${currency}" #,##0.00`;

    // Transactions sheet
    if (
      data.transactions &&
      Array.isArray(data.transactions) &&
      data.transactions.length > 0
    ) {
      const transactionsSheet = workbook.addWorksheet('Transactions');
      transactionsSheet.addRow([
        'Date',
        'Description',
        'Amount',
        'Status',
        'Linked Expense ID',
      ]);
      const headerRow = transactionsSheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F6FA' },
      };

      data.transactions.forEach((item: any) => {
        transactionsSheet.addRow([
          item.date,
          item.description,
          item.amount || 0,
          item.status,
          item.linkedExpenseId,
        ]);
      });

      transactionsSheet.getColumn('C').numFmt = `"${currency}" #,##0.00`;
      transactionsSheet.getColumn('C').alignment = { horizontal: 'right' };
      transactionsSheet.getColumn('A').numFmt = 'dd-mmm-yyyy';
      transactionsSheet.getColumn('A').alignment = { horizontal: 'center' };

      transactionsSheet.columns.forEach((col) => {
        if (col.header) col.width = 18;
      });
    }
  }

  private addXLSXTrialBalance(
    workbook: ExcelJS.Workbook,
    reportData: ReportData,
    currency: string,
  ): void {
    const data = reportData.data;

    // Summary sheet
    const summarySheet =
      workbook.getWorksheet('Summary') || workbook.addWorksheet('Summary');
    this.addXLSXHeader(summarySheet, reportData);

    if (data.summary) {
      summarySheet.addRow(['Trial Balance Summary']);
      summarySheet.addRow(['Total Debit', data.summary.totalDebit || 0]);
      summarySheet.addRow(['Total Credit', data.summary.totalCredit || 0]);
      summarySheet.addRow(['Total Balance', data.summary.totalBalance || 0]);

      [2, 3, 4].forEach((rowNum) => {
        const cell = summarySheet.getCell(`B${rowNum}`);
        cell.numFmt = `"${currency}" #,##0.00`;
      });
    }

    // Accounts sheet
    if (
      data.accounts &&
      Array.isArray(data.accounts) &&
      data.accounts.length > 0
    ) {
      const accountsSheet = workbook.addWorksheet('Accounts');
      accountsSheet.addRow([
        'Account Name',
        'Account Type',
        'Debit',
        'Credit',
        'Balance',
      ]);
      const headerRow = accountsSheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F6FA' },
      };

      data.accounts.forEach((item: any) => {
        accountsSheet.addRow([
          item.accountName,
          item.accountType,
          item.debit || 0,
          item.credit || 0,
          item.balance || 0,
        ]);
      });

      ['C', 'D', 'E'].forEach((col) => {
        accountsSheet.getColumn(col).numFmt = `"${currency}" #,##0.00`;
        accountsSheet.getColumn(col).alignment = { horizontal: 'right' };
      });

      accountsSheet.getColumn('A').width = 25;
      accountsSheet.getColumn('B').width = 15;
      ['C', 'D', 'E'].forEach((col) => {
        accountsSheet.getColumn(col).width = 18;
      });
    }
  }

  private addCSVContent(lines: string[], reportData: ReportData): void {
    const data = reportData.data;

    if (Array.isArray(data)) {
      if (data.length === 0) {
        lines.push('No data available.');
        return;
      }

      // Headers with formatted labels
      const headers = Object.keys(data[0]);
      const formattedHeaders = headers.map((h) => this.formatHeaderLabel(h));
      lines.push(formattedHeaders.join(','));

      // Data rows with proper formatting
      data.forEach((row: any) => {
        const values = headers.map((h) => {
          let value = row[h];

          // Format currency values
          const currencyFields = [
            'amount',
            'vat',
            'total',
            'totalAmount',
            'vatAmount',
            'debit',
            'credit',
            'balance',
          ];
          if (currencyFields.some((field) => h.toLowerCase().includes(field))) {
            const numValue =
              typeof value === 'string' ? parseFloat(value) : value;
            value = isNaN(numValue) ? '0.00' : numValue.toFixed(2);
          }
          // Format dates
          else if (h.toLowerCase().includes('date') && value) {
            value = this.formatDate(value);
          }
          // Format arrays
          else if (Array.isArray(value)) {
            value = value.length > 0 ? `${value.length} item(s)` : 'None';
          } else {
            value = String(value ?? '');
          }

          // Escape commas and quotes
          const valueStr = String(value);
          return valueStr.includes(',') ||
            valueStr.includes('"') ||
            valueStr.includes('\n')
            ? `"${valueStr.replace(/"/g, '""')}"`
            : valueStr;
        });
        lines.push(values.join(','));
      });
    } else if (typeof data === 'object' && data !== null) {
      // Handle structured reports
      if (reportData.type === 'vat_report') {
        lines.push('VAT Summary');
        lines.push(
          `Taxable Supplies,${data.taxableSupplies || data.taxableAmount || 0}`,
        );
        lines.push(`Input VAT,${data.inputVat || data.vatAmount || 0}`);
        lines.push(`Output VAT,${data.outputVat || 0}`);
        lines.push(`Net VAT Payable,${data.netVatPayable || 0}`);
        lines.push(`Status,${data.status || 'Pending'}`);
        lines.push('');

        if (
          data.categoryBreakdown &&
          Array.isArray(data.categoryBreakdown) &&
          data.categoryBreakdown.length > 0
        ) {
          lines.push('Category Breakdown');
          lines.push('Category,Taxable Amount,VAT Amount,Total Amount');
          data.categoryBreakdown.forEach((item: any) => {
            lines.push(
              `${item.category},${item.taxableAmount || 0},${item.vatAmount || 0},${item.totalAmount || 0}`,
            );
          });
        }
      } else if (reportData.type === 'bank_reconciliation') {
        lines.push('Reconciliation Summary');
        lines.push(`Reconciliation ID,${data.reconciliationId || 'N/A'}`);
        lines.push(`Total Transactions,${data.totalTransactions || 0}`);
        lines.push(`Matched,${data.matched || 0}`);
        lines.push(`Unmatched,${data.unmatched || 0}`);
        lines.push(`Variance,${data.variance || 0}`);
        lines.push('');

        if (
          data.transactions &&
          Array.isArray(data.transactions) &&
          data.transactions.length > 0
        ) {
          lines.push('Transactions');
          lines.push('Date,Description,Amount,Status,Linked Expense ID');
          data.transactions.forEach((item: any) => {
            lines.push(
              `${item.date || ''},${item.description || ''},${item.amount || 0},${item.status || ''},${item.linkedExpenseId || ''}`,
            );
          });
        }
      } else {
        lines.push('Key,Value');
        Object.entries(data).forEach(([key, value]) => {
          const val =
            typeof value === 'object' ? JSON.stringify(value) : String(value);
          const escaped =
            val.includes(',') || val.includes('"')
              ? `"${val.replace(/"/g, '""')}"`
              : val;
          lines.push(`${key},${escaped}`);
        });
      }
    }
  }
}
