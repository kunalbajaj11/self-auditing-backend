import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

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
    logoBuffer?: Buffer; // Pre-fetched logo image buffer for remote URLs
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
      averageExpenseAmount?: number;
      highestCategorySpend?: { category: string; amount: number };
      topVendor?: { vendor: string; amount: number };
      totalCreditNotes?: number;
      totalAdjustments?: number;
      userWithHighestUploadCount?: { user: string; count: number };
    };
    currencySettings?: {
      displayFormat?: string;
      rounding?: number;
      roundingMethod?: string;
      showOnInvoices?: boolean;
      showExchangeRate?: boolean;
    };
    exchangeRate?: {
      rate: number;
      fromCurrency: string;
      toCurrency: string;
      date: string;
    } | null;
  };
}

@Injectable()
export class ReportGeneratorService {
  /**
   * Fetch image from URL and return as Buffer
   * PDFKit cannot load images directly from URLs, so we need to fetch them first
   */
  private async fetchImageAsBuffer(url: string): Promise<Buffer | null> {
    try {
      // Skip SVG files as PDFKit doesn't support them
      const urlLower = url.toLowerCase();
      if (urlLower.endsWith('.svg') || urlLower.includes('image/svg+xml')) {
        console.warn(
          `Skipping SVG image from URL: ${url} (PDFKit doesn't support SVG)`,
        );
        return null;
      }

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000, // 10 second timeout
      });

      // Check Content-Type header to skip SVG
      const contentType = response.headers['content-type'] || '';
      if (
        contentType.includes('image/svg+xml') ||
        contentType.includes('image/svg')
      ) {
        console.warn(
          `Skipping SVG image from URL: ${url} (Content-Type: ${contentType})`,
        );
        return null;
      }

      // Check if buffer starts with SVG markers
      const buffer = Buffer.from(response.data);
      const bufferStart = buffer.slice(0, 100).toString('utf-8').toLowerCase();
      if (bufferStart.includes('<svg') || bufferStart.includes('<?xml')) {
        console.warn(
          `Skipping SVG image from URL: ${url} (detected SVG content)`,
        );
        return null;
      }

      return buffer;
    } catch (error) {
      console.warn(`Failed to fetch image from URL: ${url}`, error);
      return null;
    }
  }

  /**
   * Format currency amount based on organization settings
   */
  private formatCurrency(
    value: number | string,
    currency: string = 'AED',
    currencySettings?: {
      displayFormat?: string;
      rounding?: number;
      roundingMethod?: string;
      showOnInvoices?: boolean;
    },
  ): string {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) {
      const decimalPlaces = currencySettings?.rounding ?? 2;
      const rounded = 0;
      const formatted = rounded.toFixed(decimalPlaces);
      return this.formatCurrencyDisplay(formatted, currency, currencySettings);
    }

    // Apply rounding method
    const roundingMethod = currencySettings?.roundingMethod || 'standard';
    const decimalPlaces = currencySettings?.rounding ?? 2;
    let rounded: number;

    if (roundingMethod === 'up') {
      rounded =
        Math.ceil(numValue * Math.pow(10, decimalPlaces)) /
        Math.pow(10, decimalPlaces);
    } else if (roundingMethod === 'down') {
      rounded =
        Math.floor(numValue * Math.pow(10, decimalPlaces)) /
        Math.pow(10, decimalPlaces);
    } else {
      // standard rounding
      rounded =
        Math.round(numValue * Math.pow(10, decimalPlaces)) /
        Math.pow(10, decimalPlaces);
    }

    const formatted = rounded
      .toFixed(decimalPlaces)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    // If showOnInvoices is false, return only the number
    if (currencySettings?.showOnInvoices === false) {
      return formatted;
    }

    return this.formatCurrencyDisplay(formatted, currency, currencySettings);
  }

  /**
   * Format currency display based on display format setting
   * Note: Arabic script symbols don't render well in PDFs, so we use standard currency codes
   */
  private formatCurrencyDisplay(
    formattedNumber: string,
    currency: string,
    currencySettings?: { displayFormat?: string },
  ): string {
    const format = currencySettings?.displayFormat || 'symbol';
    // Use PDF-safe symbols (avoid Arabic script which doesn't render properly)
    const currencySymbols: Record<string, string> = {
      AED: 'AED',
      USD: '$',
      EUR: '€',
      GBP: '£',
      SAR: 'SAR',
      OMR: 'OMR',
      KWD: 'KWD',
      BHD: 'BHD',
      INR: '₹',
    };

    const symbol = currencySymbols[currency] || currency;

    if (format === 'code') {
      return `${currency} ${formattedNumber}`;
    } else if (format === 'both') {
      return `${symbol} ${formattedNumber}`;
    } else {
      // symbol (default)
      return `${symbol} ${formattedNumber}`;
    }
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

  private formatDateForInvoice(dateString: string | Date): string {
    if (!dateString) return '';
    const date =
      typeof dateString === 'string' ? new Date(dateString) : dateString;
    const day = date.getDate().toString().padStart(2, '0');
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear().toString().slice(-2);
    return `${day}-${month}-${year}`;
  }

  private numberToWords(num: number): string {
    const ones = [
      '',
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
      'Nine',
      'Ten',
      'Eleven',
      'Twelve',
      'Thirteen',
      'Fourteen',
      'Fifteen',
      'Sixteen',
      'Seventeen',
      'Eighteen',
      'Nineteen',
    ];
    const tens = [
      '',
      '',
      'Twenty',
      'Thirty',
      'Forty',
      'Fifty',
      'Sixty',
      'Seventy',
      'Eighty',
      'Ninety',
    ];

    if (num === 0) return 'Zero';

    const convertHundreds = (n: number): string => {
      if (n === 0) return '';
      let result = '';
      if (n >= 100) {
        result += ones[Math.floor(n / 100)] + ' Hundred ';
        n %= 100;
        if (n > 0) result += 'and ';
      }
      if (n >= 20) {
        result += tens[Math.floor(n / 10)] + ' ';
        n %= 10;
      }
      if (n > 0) {
        result += ones[n] + ' ';
      }
      return result.trim();
    };

    let result = '';
    const integerPart = Math.floor(num);
    const decimalPart = Math.round((num - integerPart) * 100);

    if (integerPart >= 1000000) {
      const millions = Math.floor(integerPart / 1000000);
      result += convertHundreds(millions) + ' Million ';
      const remainder = integerPart % 1000000;
      if (remainder > 0) {
        result += convertHundreds(remainder);
      }
    } else if (integerPart >= 1000) {
      const thousands = Math.floor(integerPart / 1000);
      result += convertHundreds(thousands) + ' Thousand ';
      const remainder = integerPart % 1000;
      if (remainder > 0) {
        result += convertHundreds(remainder);
      }
    } else {
      result += convertHundreds(integerPart);
    }

    return result.trim();
  }

  async generatePDF(reportData: ReportData): Promise<Buffer> {
    // Pre-fetch remote logo if URL is provided
    if (
      reportData.metadata?.logoUrl &&
      (reportData.metadata.logoUrl.startsWith('http://') ||
        reportData.metadata.logoUrl.startsWith('https://'))
    ) {
      const logoBuffer = await this.fetchImageAsBuffer(
        reportData.metadata.logoUrl,
      );
      if (logoBuffer) {
        reportData = {
          ...reportData,
          metadata: {
            ...reportData.metadata,
            logoBuffer,
          },
        };
      }
    }

    return new Promise((resolve, reject) => {
      try {
        // Special handling for sales invoice
        if (reportData.type === 'sales_invoice') {
          this.generateInvoicePDF(reportData).then(resolve).catch(reject);
          return;
        }

        // Special handling for purchase order
        if (reportData.type === 'purchase_order') {
          this.generatePurchaseOrderPDF(reportData).then(resolve).catch(reject);
          return;
        }

        // Use landscape for wide tables, portrait for summary reports
        const useLandscape = this.shouldUseLandscape(reportData.type);
        // A4 dimensions in points: 595.28 x 841.89 (210mm x 297mm)
        // For landscape, swap width and height: 841.89 x 595.28
        const pageSize = useLandscape
          ? [841.89, 595.28] // Landscape A4: width 841.89, height 595.28
          : [595.28, 841.89]; // Portrait A4: width 595.28, height 841.89
        const doc = new PDFDocument({
          margin: 50,
          size: pageSize,
          bufferPages: true, // Enable page buffering for footer insertion
          autoFirstPage: true,
        });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Header with company info (already includes report title on right side)
        this.addPDFHeader(doc, reportData);

        // Reset position for content: left margin (x=50) and right after header (y=175)
        doc.x = 50;
        doc.y = 175;
        doc.fillColor('#1a1a1a');

        // Content based on report type (no duplicate title - it's in the header)
        this.addPDFContent(doc, reportData);

        // Footer on every page with page numbers
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
          doc.switchToPage(range.start + i);
          this.addPDFFooter(doc, reportData, i + 1, range.count);
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
      'stock_balance',
      'general_ledger',
    ];
    return landscapeReports.includes(reportType);
  }

  private getReportTitle(reportType: string): string {
    const titles: Record<string, string> = {
      expense_summary: 'Expense Summary Report',
      expense_detail: 'Expense Detail Report',
      vat_report: 'VAT Summary Report',
      vat_control_account: 'VAT Control Account Report',
      bank_reconciliation: 'Bank Reconciliation Summary',
      attachments_report: 'Attachments Report',
      trial_balance: 'Trial Balance Report',
      general_ledger: 'General Ledger Report',
      balance_sheet: 'Balance Sheet Report',
      profit_and_loss: 'Profit and Loss Statement',
      payables: 'Payables (Accruals) Report',
      receivables: 'Receivables Report',
      stock_balance: 'Stock Balance Report',
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
    const headerBgColor = '#f8f9fa'; // Professional light gray
    const headerHeight = 130;

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
      // PDFKit only supports JPEG, PNG, GIF - NOT SVG
      // Try multiple possible paths for the logo (prioritize JPG/JPEG/PNG)
      const possiblePaths = [
        // JPG/JPEG logo paths (preferred - PDFKit compatible)
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
        path.join(process.cwd(), 'assets', 'images', 'logo.jpeg'),
        path.join(__dirname, '..', '..', '..', 'assets', 'images', 'logo.jpeg'),
        path.join(__dirname, '..', '..', 'assets', 'images', 'logo.jpeg'),
        path.join(process.cwd(), 'assets', 'images', 'logo.jpg'),
        path.join(__dirname, '..', '..', '..', 'assets', 'images', 'logo.jpg'),
        path.join(__dirname, '..', '..', 'assets', 'images', 'logo.jpg'),
        // PNG logo paths (fallback)
        path.join(process.cwd(), 'assets', 'images', 'logo.png'),
        path.join(__dirname, '..', '..', '..', 'assets', 'images', 'logo.png'),
        path.join(__dirname, '..', '..', 'assets', 'images', 'logo.png'),
      ];

      for (const logoPath of possiblePaths) {
        if (fs.existsSync(logoPath)) {
          // Double-check it's not an SVG file (case-insensitive)
          const ext = path.extname(logoPath).toLowerCase();
          if (ext === '.svg') {
            continue; // Skip SVG files as PDFKit doesn't support them
          }
          return logoPath;
        }
      }
      return null;
    };

    // Use pre-fetched logo buffer, organization logo URL, or application logo
    const logoBuffer = reportData.metadata?.logoBuffer;
    const logoUrl = reportData.metadata?.logoUrl;
    const localLogoPath = getApplicationLogoPath();

    let logoLoaded = false;

    try {
      if (logoBuffer) {
        // Check if buffer contains SVG content (PDFKit doesn't support SVG)
        const bufferStart = logoBuffer
          .slice(0, 100)
          .toString('utf-8')
          .toLowerCase();
        if (bufferStart.includes('<svg') || bufferStart.includes('<?xml')) {
          console.warn("Skipping SVG logo buffer (PDFKit doesn't support SVG)");
        } else {
          // Use pre-fetched logo buffer (for remote URLs)
          doc.image(logoBuffer, logoX, logoY, {
            width: logoSize,
            height: logoSize,
            fit: [logoSize, logoSize],
          });
          logoLoaded = true;
        }
      } else if (
        logoUrl &&
        !logoUrl.startsWith('http://') &&
        !logoUrl.startsWith('https://') &&
        fs.existsSync(logoUrl)
      ) {
        // For local file paths - skip SVG files as PDFKit doesn't support them
        const ext = path.extname(logoUrl).toLowerCase();
        if (ext !== '.svg') {
          doc.image(logoUrl, logoX, logoY, {
            width: logoSize,
            height: logoSize,
            fit: [logoSize, logoSize],
          });
          logoLoaded = true;
        }
      } else if (localLogoPath) {
        // Use application default logo
        doc.image(localLogoPath, logoX, logoY, {
          width: logoSize,
          height: logoSize,
          fit: [logoSize, logoSize],
        });
        logoLoaded = true;
      }
    } catch (error) {
      // If logo fails to load, show application name
      console.warn('Failed to load logo:', error);
    }

    if (!logoLoaded) {
      // Fallback: show application name as text
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#1a1a1a');
      doc.text('SelfAccounting.AI', logoX, logoY, { width: logoSize });
    }

    // Company name (to the right of the logo) - Enhanced styling
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#0077c8'); // Brand color
    const orgName =
      reportData.metadata?.organizationName || 'SelfAccounting.AI';
    const leftTextX = logoX + logoSize + 15;
    doc.text(orgName, leftTextX, 40, {
      width: pageWidth / 2 - (leftTextX - margin) - 20,
    });

    // Organization details (left side, under organization name)
    doc.fontSize(9).font('Helvetica').fillColor('#666666');
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

    // Report title and metadata (right side) - Enhanced styling
    const rightX = pageWidth / 2 + 20;
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#0077c8'); // Brand color
    doc.text(this.getReportTitle(reportData.type), rightX, 40, {
      width: pageWidth - rightX - margin,
      align: 'right',
    });

    doc.fontSize(9).font('Helvetica').fillColor('#666666');
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

    // Horizontal line below header - enhanced professional border
    doc
      .moveTo(margin, 30 + headerHeight + 5)
      .lineTo(pageWidth - margin, 30 + headerHeight + 5)
      .strokeColor('#0077c8') // Brand color accent
      .lineWidth(2)
      .stroke();

    // Additional subtle line for depth
    doc
      .moveTo(margin, 30 + headerHeight + 7)
      .lineTo(pageWidth - margin, 30 + headerHeight + 7)
      .strokeColor('#e0e0e0')
      .lineWidth(0.5)
      .stroke();

    // Reset fill color
    doc.fillColor('#1a1a1a');
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

    // Summary box background - Enhanced professional styling
    const summaryStartY = doc.y;
    const summaryHeight = 190; // Slightly increased for better spacing
    const summaryWidth = pageWidth - 2 * margin;

    // Outer border with brand color accent
    doc
      .rect(margin, summaryStartY, summaryWidth, summaryHeight)
      .fillColor('#f8f9fa')
      .fill()
      .strokeColor('#0077c8')
      .lineWidth(1.5)
      .stroke();

    // Inner border for depth
    doc
      .rect(margin + 2, summaryStartY + 2, summaryWidth - 4, summaryHeight - 4)
      .strokeColor('#e0e0e0')
      .lineWidth(0.5)
      .stroke();

    // Summary title with enhanced styling
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#0077c8');
    const titleY = summaryStartY + 12;
    doc.text(`Summary (Period: ${period})`, margin + 12, titleY);

    // Underline for title
    doc
      .moveTo(margin + 12, titleY + 16)
      .lineTo(
        margin + 12 + doc.widthOfString(`Summary (Period: ${period})`),
        titleY + 16,
      )
      .strokeColor('#0077c8')
      .lineWidth(1)
      .stroke();

    // Summary content in two columns with better spacing
    const leftX = margin + 15;
    const rightX = pageWidth / 2 + 15;
    let yPos = summaryStartY + 40;
    doc.fontSize(10.5).font('Helvetica').fillColor('#374151');

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

    // Right column with better spacing
    yPos = summaryStartY + 40;
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
    doc.fillColor('#1a1a1a');
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

    doc.fontSize(8).font('Helvetica').fillColor('#666666');

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
    doc.fillColor('#1a1a1a');
  }

  async generateXLSX(reportData: ReportData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SelfAccounting.AI';
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
      reportData.type === 'general_ledger' &&
      typeof reportData.data === 'object'
    ) {
      // General Ledger with account-by-account transactions
      this.addXLSXGeneralLedger(workbook, reportData, currency);
    } else if (
      reportData.type === 'balance_sheet' &&
      typeof reportData.data === 'object'
    ) {
      // Balance Sheet with multiple tabs
      this.addXLSXBalanceSheet(workbook, reportData, currency);
    } else if (
      reportData.type === 'profit_and_loss' &&
      typeof reportData.data === 'object'
    ) {
      // Profit and Loss with multiple tabs
      this.addXLSXProfitAndLoss(workbook, reportData, currency);
    } else if (
      reportData.type === 'payables' &&
      typeof reportData.data === 'object'
    ) {
      // Payables report
      this.addXLSXPayables(workbook, reportData, currency);
    } else if (
      reportData.type === 'receivables' &&
      typeof reportData.data === 'object'
    ) {
      // Receivables report
      this.addXLSXReceivables(workbook, reportData, currency);
    } else if (
      reportData.type === 'vat_control_account' &&
      typeof reportData.data === 'object'
    ) {
      // VAT Control Account report
      this.addXLSXVatControlAccount(workbook, reportData, currency);
    } else if (
      reportData.type === 'stock_balance' &&
      typeof reportData.data === 'object'
    ) {
      // Stock Balance report
      this.addXLSXStockBalance(workbook, reportData, currency);
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

    // Headers - Enhanced professional styling
    const headers = Object.keys(data[0]);
    const formattedHeaders = headers.map((h) => this.formatHeaderLabel(h));
    expenseSheet.addRow(formattedHeaders);
    const headerRow = expenseSheet.getRow(expenseSheet.rowCount);
    headerRow.font = {
      bold: true,
      size: 11,
      color: { argb: 'FFFFFFFF' }, // White text
    };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0077C8' }, // Brand color
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.border = {
      top: { style: 'medium', color: { argb: 'FF005A9A' } },
      bottom: { style: 'medium', color: { argb: 'FF005A9A' } },
      left: { style: 'thin', color: { argb: 'FF005A9A' } },
      right: { style: 'thin', color: { argb: 'FF005A9A' } },
    };
    headerRow.height = 22;

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

      // Alternate row colors - Enhanced styling
      if (index % 2 === 0) {
        dataRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8F9FA' }, // Light gray
        };
      } else {
        dataRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFFFF' }, // White
        };
      }

      // Format currency columns - Enhanced borders with consistent styling
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
          cell.alignment = {
            horizontal: 'right',
            vertical: 'middle',
            wrapText: false,
          };
        } else if (header.toLowerCase().includes('date')) {
          cell.numFmt = 'dd-mmm-yyyy';
          cell.alignment = {
            horizontal: 'center',
            vertical: 'middle',
            wrapText: false,
          };
        } else {
          cell.alignment = {
            horizontal: 'left',
            vertical: 'middle',
            wrapText: true,
          };
        }
        // Enhanced borders with consistent styling
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        };
        // Add padding for better readability
        cell.font = { size: 10, color: { argb: 'FF1F2937' } };
      });
      dataRow.height = 22; // Increased height for better readability
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
    // Category Summary Sheet with enhanced styling
    const categorySheet = workbook.addWorksheet('Category Summary');
    categorySheet.addRow(['Category', 'Count', 'Amount', 'VAT', 'Total']);
    const categoryHeaderRow = categorySheet.getRow(1);
    categoryHeaderRow.font = {
      bold: true,
      size: 11,
      color: { argb: 'FFFFFFFF' }, // White text
    };
    categoryHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0077C8' }, // Brand color
    };
    categoryHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };
    categoryHeaderRow.border = {
      top: { style: 'medium', color: { argb: 'FF005A9A' } },
      bottom: { style: 'medium', color: { argb: 'FF005A9A' } },
      left: { style: 'thin', color: { argb: 'FF005A9A' } },
      right: { style: 'thin', color: { argb: 'FF005A9A' } },
    };
    categoryHeaderRow.height = 22;

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

    Array.from(categoryMap.entries()).forEach(([category, value], index) => {
      const row = categorySheet.addRow([
        category,
        value.count,
        value.amount,
        value.vat,
        value.total,
      ]);

      // Alternate row colors
      if (index % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8F9FA' },
        };
      }

      // Add borders to all cells
      [1, 2, 3, 4, 5].forEach((colNum) => {
        const cell = row.getCell(colNum);
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        };
        cell.font = { size: 10, color: { argb: 'FF1F2937' } };
      });

      row.height = 20;
    });

    // Format currency columns with proper alignment
    ['C', 'D', 'E'].forEach((col) => {
      categorySheet.getColumn(col).numFmt = `"${currency}" #,##0.00`;
      categorySheet.getColumn(col).alignment = {
        horizontal: 'right',
        vertical: 'middle',
      };
    });

    // Format count column
    categorySheet.getColumn('B').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };

    // Auto-fit columns
    categorySheet.columns.forEach((column) => {
      if (column.header) {
        column.width = Math.max(15, column.header.length + 2);
      }
    });

    // Vendor Summary Sheet
    const vendorSheet = workbook.addWorksheet('Vendor Summary');
    vendorSheet.addRow(['Vendor', 'Count', 'Amount', 'VAT', 'Total']);
    const vendorHeaderRow = vendorSheet.getRow(1);
    vendorHeaderRow.font = {
      bold: true,
      size: 11,
      color: { argb: 'FFFFFFFF' },
    };
    vendorHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0077C8' },
    };
    vendorHeaderRow.border = {
      top: { style: 'medium', color: { argb: 'FF005A9A' } },
      bottom: { style: 'medium', color: { argb: 'FF005A9A' } },
      left: { style: 'thin', color: { argb: 'FF005A9A' } },
      right: { style: 'thin', color: { argb: 'FF005A9A' } },
    };
    vendorHeaderRow.height = 22;
    vendorHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };

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

    Array.from(vendorMap.entries()).forEach(([vendor, value], index) => {
      const row = vendorSheet.addRow([
        vendor,
        value.count,
        value.amount,
        value.vat,
        value.total,
      ]);

      // Alternate row colors
      if (index % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8F9FA' },
        };
      }

      // Add borders to all cells
      [1, 2, 3, 4, 5].forEach((colNum) => {
        const cell = row.getCell(colNum);
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        };
        cell.font = { size: 10, color: { argb: 'FF1F2937' } };
      });

      row.height = 20;
    });

    // Format currency columns with proper alignment
    ['C', 'D', 'E'].forEach((col) => {
      vendorSheet.getColumn(col).numFmt = `"${currency}" #,##0.00`;
      vendorSheet.getColumn(col).alignment = {
        horizontal: 'right',
        vertical: 'middle',
      };
    });

    // Format count column
    vendorSheet.getColumn('B').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };

    // Auto-fit columns
    vendorSheet.columns.forEach((column) => {
      if (column.header) {
        column.width = Math.max(15, column.header.length + 2);
      }
    });

    // Monthly Breakdown Sheet
    const monthlySheet = workbook.addWorksheet('Monthly Breakdown');
    monthlySheet.addRow(['Month', 'Total Spend', 'VAT']);
    const monthlyHeaderRow = monthlySheet.getRow(1);
    monthlyHeaderRow.font = {
      bold: true,
      size: 11,
      color: { argb: 'FFFFFFFF' },
    };
    monthlyHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0077C8' },
    };
    monthlyHeaderRow.border = {
      top: { style: 'medium', color: { argb: 'FF005A9A' } },
      bottom: { style: 'medium', color: { argb: 'FF005A9A' } },
      left: { style: 'thin', color: { argb: 'FF005A9A' } },
      right: { style: 'thin', color: { argb: 'FF005A9A' } },
    };
    monthlyHeaderRow.height = 22;
    monthlyHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };

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

    sortedMonths.forEach(([month, value], index) => {
      const row = monthlySheet.addRow([month, value.spend, value.vat]);

      // Alternate row colors
      if (index % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8F9FA' },
        };
      }

      // Add borders to all cells
      [1, 2, 3].forEach((colNum) => {
        const cell = row.getCell(colNum);
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        };
        cell.font = { size: 10, color: { argb: 'FF1F2937' } };
      });

      row.height = 20;
    });

    // Format currency columns with proper alignment
    ['B', 'C'].forEach((col) => {
      monthlySheet.getColumn(col).numFmt = `"${currency}" #,##0.00`;
      monthlySheet.getColumn(col).alignment = {
        horizontal: 'right',
        vertical: 'middle',
      };
    });

    // Format month column
    monthlySheet.getColumn('A').alignment = {
      horizontal: 'left',
      vertical: 'middle',
    };

    // Auto-fit columns
    monthlySheet.columns.forEach((column) => {
      if (column.header) {
        column.width = Math.max(15, column.header.length + 2);
      }
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

    // Professional header section with clear separation
    lines.push('='.repeat(80));
    lines.push(reportData.metadata?.organizationName || 'SelfAccounting.AI');
    lines.push('='.repeat(80));
    lines.push('');
    lines.push(`Report Type: ${this.getReportTitle(reportData.type)}`);
    lines.push('');

    // Report metadata section
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

    if (reportData.metadata?.address) {
      lines.push(`Address: ${reportData.metadata.address}`);
    }

    if (reportData.metadata?.email) {
      lines.push(`Email: ${reportData.metadata.email}`);
    }

    const generatedDate = reportData.metadata?.generatedAt
      ? this.formatDate(reportData.metadata.generatedAt)
      : new Date().toLocaleDateString('en-GB');
    lines.push(`Generated: ${generatedDate}`);

    if (reportData.metadata?.generatedByName) {
      lines.push(`Generated by: ${reportData.metadata.generatedByName}`);
    }

    lines.push(`Currency: ${reportData.metadata?.currency || 'AED'}`);
    lines.push('');
    lines.push('-'.repeat(80));
    lines.push('');

    // Add summary if available
    if (reportData.metadata?.summary) {
      lines.push('SUMMARY');
      lines.push('-'.repeat(80));
      const summary = reportData.metadata.summary;
      const currency = reportData.metadata?.currency || 'AED';

      if (summary.totalExpenses !== undefined) {
        lines.push(`Total Number of Expenses,${summary.totalExpenses}`);
      }
      if (summary.totalAmountBeforeVat !== undefined) {
        lines.push(
          `Total Amount (Before VAT),${this.formatCurrency(summary.totalAmountBeforeVat, currency)}`,
        );
      }
      if (summary.totalVatAmount !== undefined) {
        lines.push(
          `Total VAT Amount,${this.formatCurrency(summary.totalVatAmount, currency)}`,
        );
      }
      if (summary.totalAmountAfterVat !== undefined) {
        lines.push(
          `Total Amount (After VAT),${this.formatCurrency(summary.totalAmountAfterVat, currency)}`,
        );
      }
      if (summary.averageExpenseAmount !== undefined) {
        lines.push(
          `Average Expense Amount,${this.formatCurrency(summary.averageExpenseAmount, currency)}`,
        );
      }
      if (summary.highestCategorySpend) {
        lines.push(
          `Highest Category Spend,${summary.highestCategorySpend.category},${this.formatCurrency(summary.highestCategorySpend.amount, currency)}`,
        );
      }
      if (summary.topVendor) {
        lines.push(
          `Top Vendor,${summary.topVendor.vendor},${this.formatCurrency(summary.topVendor.amount, currency)}`,
        );
      }
      lines.push('');
      lines.push('-'.repeat(80));
      lines.push('');
    }

    // Add content based on report type
    this.addCSVContent(lines, reportData);

    // Footer
    lines.push('');
    lines.push('-'.repeat(80));
    lines.push('End of Report');
    lines.push('Generated by SelfAccounting.AI');
    lines.push('-'.repeat(80));

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

      // Table header with enhanced professional styling
      const headerY = doc.y;
      const headerHeight = 32; // Increased height for better visual presence

      // Header background with brand color accent and shadow effect
      doc
        .rect(margin, headerY, availableWidth, headerHeight)
        .fillColor('#0077c8') // Brand color
        .fill();

      // Header border with enhanced styling
      doc
        .rect(margin, headerY, availableWidth, headerHeight)
        .strokeColor('#005a9a')
        .lineWidth(1.5)
        .stroke();

      // Add subtle inner highlight for depth
      doc
        .moveTo(margin, headerY + 1)
        .lineTo(margin + availableWidth, headerY + 1)
        .strokeColor('#0088d9')
        .lineWidth(0.5)
        .stroke();

      doc.fontSize(11.5).font('Helvetica-Bold').fillColor('#ffffff'); // White text on colored background
      let x = margin + 10;
      headers.forEach((header) => {
        const headerLabel = this.formatHeaderLabel(header);
        doc.text(headerLabel, x, headerY + 10, {
          width: colWidth - 20,
          align: this.getColumnAlignment(header),
        });
        x += colWidth;
      });
      doc.fillColor('#1a1a1a');

      // Data rows with alternating colors and enhanced spacing
      let rowY = headerY + headerHeight + 2;
      const rowHeight = 24; // Increased row height for better readability
      data.forEach((row: any, index: number) => {
        // Check if we need a new page
        if (rowY > doc.page.height - 100) {
          doc.addPage();
          this.addPDFHeader(doc, reportData);
          rowY = doc.y;
          // Redraw header on new page with enhanced styling
          const newHeaderHeight = 32;
          doc
            .rect(margin, rowY, availableWidth, newHeaderHeight)
            .fillColor('#0077c8')
            .fill();
          doc
            .rect(margin, rowY, availableWidth, newHeaderHeight)
            .strokeColor('#005a9a')
            .lineWidth(1.5)
            .stroke();
          doc
            .moveTo(margin, rowY + 1)
            .lineTo(margin + availableWidth, rowY + 1)
            .strokeColor('#0088d9')
            .lineWidth(0.5)
            .stroke();
          doc.fontSize(11.5).font('Helvetica-Bold').fillColor('#ffffff');
          x = margin + 10;
          headers.forEach((header) => {
            const headerLabel = this.formatHeaderLabel(header);
            doc.text(headerLabel, x, rowY + 10, {
              width: colWidth - 20,
              align: this.getColumnAlignment(header),
            });
            x += colWidth;
          });
          doc.fillColor('#1a1a1a');
          rowY += newHeaderHeight + 2;
        }

        // Draw row border for enhanced professional look with better borders
        doc.strokeColor('#d1d5db').lineWidth(0.5);
        doc.rect(margin, rowY, availableWidth, rowHeight).stroke();

        // Alternate row background with subtle colors
        if (index % 2 === 0) {
          doc
            .rect(margin, rowY, availableWidth, rowHeight)
            .fillColor('#f9fafb')
            .fill();
        } else {
          doc
            .rect(margin, rowY, availableWidth, rowHeight)
            .fillColor('#ffffff')
            .fill();
        }

        // Add subtle vertical dividers between columns
        if (headers.length > 1) {
          doc.strokeColor('#e5e7eb').lineWidth(0.3);
          for (let i = 1; i < headers.length; i++) {
            const dividerX = margin + i * colWidth;
            doc
              .moveTo(dividerX, rowY)
              .lineTo(dividerX, rowY + rowHeight)
              .stroke();
          }
        }

        doc.fontSize(10).font('Helvetica').fillColor('#1a1a1a');
        x = margin + 10;
        headers.forEach((header) => {
          const value = this.formatCellValue(row[header], header, currency);
          doc.text(value, x, rowY + 8, {
            width: colWidth - 20,
            align: this.getColumnAlignment(header),
            lineBreak: false,
            ellipsis: true,
          });
          x += colWidth;
        });
        rowY += rowHeight;
      });

      // Total row if applicable - Enhanced styling with better visual separation
      if (this.shouldShowTotal(reportData.type) && data.length > 0) {
        const totalRow = this.calculateTotalRow(data, headers, currency);
        rowY += 6; // Add spacing before total row

        // Draw separator line above total
        doc
          .moveTo(margin, rowY)
          .lineTo(margin + availableWidth, rowY)
          .strokeColor('#0077c8')
          .lineWidth(2)
          .stroke();

        rowY += 4;
        const totalRowHeight = 30; // Increased height for emphasis

        // Total row with professional styling and shadow effect
        doc
          .rect(margin, rowY, availableWidth, totalRowHeight)
          .fillColor('#e8f4f8') // Light brand color tint
          .fill()
          .strokeColor('#0077c8')
          .lineWidth(2)
          .stroke();

        // Add inner border for depth
        doc
          .rect(margin + 1, rowY + 1, availableWidth - 2, totalRowHeight - 2)
          .strokeColor('#b3d9f0')
          .lineWidth(0.5)
          .stroke();

        doc.fontSize(11.5).font('Helvetica-Bold').fillColor('#005a9a');
        x = margin + 10;
        headers.forEach((header) => {
          const value = totalRow[header] || '';
          doc.text(value, x, rowY + 10, {
            width: colWidth - 20,
            align: this.getColumnAlignment(header),
          });
          x += colWidth;
        });
        doc.fillColor('#1a1a1a');
        rowY += totalRowHeight;
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
      'openingDebit',
      'openingCredit',
      'openingBalance',
      'periodDebit',
      'periodCredit',
      'periodBalance',
      'closingDebit',
      'closingCredit',
      'closingBalance',
      'paidAmount',
      'outstanding',
      'outstandingAmount',
      'openingAssets',
      'openingLiabilities',
      'openingEquity',
      'periodAssets',
      'periodLiabilities',
      'periodEquity',
      'closingAssets',
      'closingLiabilities',
      'closingEquity',
      'grossProfit',
      'totalExpenses',
      'netProfit',
      'openingRetainedEarnings',
      'closingRetainedEarnings',
      'periodAmount',
      'overdueAmount',
      'totalOutstanding',
      'totalDebit',
      'totalCredit',
      'totalBalance',
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
      'openingDebit',
      'openingCredit',
      'openingBalance',
      'periodDebit',
      'periodCredit',
      'periodBalance',
      'closingDebit',
      'closingCredit',
      'closingBalance',
      'paidAmount',
      'outstanding',
      'outstandingAmount',
      'openingAssets',
      'openingLiabilities',
      'openingEquity',
      'periodAssets',
      'periodLiabilities',
      'periodEquity',
      'closingAssets',
      'closingLiabilities',
      'closingEquity',
      'grossProfit',
      'totalExpenses',
      'netProfit',
      'openingRetainedEarnings',
      'closingRetainedEarnings',
      'periodAmount',
      'overdueAmount',
      'totalOutstanding',
      'totalDebit',
      'totalCredit',
      'totalBalance',
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
    // Handle Balance Sheet
    else if (reportData.type === 'balance_sheet') {
      this.addPDFBalanceSheet(doc, data, currency);
    }
    // Handle General Ledger
    else if (reportData.type === 'general_ledger') {
      this.addPDFGeneralLedger(doc, data, currency);
    }
    // Handle Trial Balance
    else if (reportData.type === 'trial_balance') {
      const margin = 40; // Reduced margin for more space
      const pageWidth = doc.page.width;
      const contentWidth = pageWidth - 2 * margin;

      // Summary section with compact spacing
      doc.y = 175;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#1a1a1a');
      doc.text('Summary', margin, doc.y);
      doc.y += 12;
      doc.fontSize(8).font('Helvetica').fillColor('#1a1a1a');
      if (data.summary) {
        doc.text('Opening Balances:', margin);
        doc.y += 10;
        doc.text(
          `Opening Debit: ${this.formatCurrency(data.summary.openingDebit || 0, currency)}`,
          margin + 8,
        );
        doc.y += 9;
        doc.text(
          `Opening Credit: ${this.formatCurrency(data.summary.openingCredit || 0, currency)}`,
          margin + 8,
        );
        doc.y += 9;
        doc.font('Helvetica-Bold').fontSize(9);
        doc.text(
          `Opening Balance: ${this.formatCurrency(data.summary.openingBalance || 0, currency)}`,
          margin + 8,
        );
        doc.y += 12;
        doc.font('Helvetica').fontSize(8);
        doc.text('Period Transactions:', margin);
        doc.y += 10;
        doc.text(
          `Period Debit: ${this.formatCurrency(data.summary.periodDebit || 0, currency)}`,
          margin + 8,
        );
        doc.y += 9;
        doc.text(
          `Period Credit: ${this.formatCurrency(data.summary.periodCredit || 0, currency)}`,
          margin + 8,
        );
        doc.y += 9;
        doc.text(
          `Period Balance: ${this.formatCurrency(data.summary.periodBalance || 0, currency)}`,
          margin + 8,
        );
        doc.y += 12;
        doc.text('Closing Balances:', margin);
        doc.y += 10;
        doc.text(
          `Closing Debit: ${this.formatCurrency(data.summary.closingDebit || 0, currency)}`,
          margin + 8,
        );
        doc.y += 9;
        doc.text(
          `Closing Credit: ${this.formatCurrency(data.summary.closingCredit || 0, currency)}`,
          margin + 8,
        );
        doc.y += 9;
        doc.font('Helvetica-Bold').fontSize(9);
        doc.text(
          `Closing Balance: ${this.formatCurrency(data.summary.closingBalance || 0, currency)}`,
          margin + 8,
        );
        doc.y += 12;
        doc.font('Helvetica').fontSize(8);
        doc.text('Total Summary:', margin);
        doc.y += 10;
        doc.font('Helvetica-Bold').fontSize(9);
        doc.text(
          `Total Debit: ${this.formatCurrency(data.summary.closingDebit || data.summary.totalDebit || 0, currency)}`,
          margin + 8,
        );
        doc.y += 9;
        doc.text(
          `Total Credit: ${this.formatCurrency(data.summary.closingCredit || data.summary.totalCredit || 0, currency)}`,
          margin + 8,
        );
        doc.y += 9;
        doc.fontSize(10);
        doc.text(
          `Total Balance: ${this.formatCurrency(data.summary.closingBalance || data.summary.totalBalance || 0, currency)}`,
          margin + 8,
        );
        doc.y += 15;
      }

      // Accounts table with compact spacing
      if (
        data.accounts &&
        Array.isArray(data.accounts) &&
        data.accounts.length > 0
      ) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1a1a1a');
        doc.text('Accounts', margin, doc.y);
        doc.y += 12;

        // Update table to include opening/closing columns
        const accountsWithBalances = data.accounts.map((acc: any) => ({
          accountName: acc.accountName,
          accountType: acc.accountType,
          openingDebit: acc.openingDebit || 0,
          openingCredit: acc.openingCredit || 0,
          openingBalance: acc.openingBalance || 0,
          periodDebit: acc.debit || 0,
          periodCredit: acc.credit || 0,
          periodBalance: acc.balance || 0,
          closingDebit: acc.closingDebit || 0,
          closingCredit: acc.closingCredit || 0,
          closingBalance: acc.closingBalance || 0,
        }));

        // Use custom table rendering for trial balance with smaller fonts
        this.addTrialBalanceTable(
          doc,
          accountsWithBalances,
          [
            'accountName',
            'accountType',
            'openingDebit',
            'openingCredit',
            'openingBalance',
            'periodDebit',
            'periodCredit',
            'periodBalance',
            'closingDebit',
            'closingCredit',
            'closingBalance',
          ],
          currency,
          margin,
          contentWidth,
        );
      } else {
        doc
          .fontSize(8)
          .font('Helvetica')
          .text('No accounts data available.', margin);
      }
    }
    // Handle Profit and Loss
    else if (reportData.type === 'profit_and_loss') {
      this.addPDFProfitAndLoss(doc, data, currency);
    }
    // Handle Receivables
    else if (reportData.type === 'receivables') {
      this.addPDFReceivables(doc, data, currency);
    }
    // Handle Payables
    else if (reportData.type === 'payables') {
      this.addPDFPayables(doc, data, currency);
    }
    // Handle VAT Control Account
    else if (reportData.type === 'vat_control_account') {
      this.addPDFVatControlAccount(doc, data, currency);
    }
    // Handle Stock Balance
    else if (reportData.type === 'stock_balance') {
      this.addPDFStockBalance(doc, data, currency);
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

  /**
   * Professional Balance Sheet PDF Rendering
   */
  private addPDFBalanceSheet(
    doc: PDFKit.PDFDocument,
    data: any,
    currency: string,
  ): void {
    const margin = 50;
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - 2 * margin;

    // Brand colors
    const primaryColor = '#0077C8';
    const accentColor = '#00A3E0';
    const headerBg = '#f0f7fc';
    const altRowBg = '#f8fafc';
    const borderColor = '#e1e8ed';
    const textDark = '#1a1a1a';
    const textMuted = '#6b7280';

    // Starting position
    doc.y = 175;

    // ============ SUMMARY CARDS SECTION ============
    const cardWidth = (contentWidth - 30) / 4; // 4 cards with gaps
    const cardHeight = 60;
    const cardY = doc.y;

    const summaryItems = [
      {
        label: 'Opening Assets',
        value: data.summary?.openingAssets || 0,
        color: primaryColor,
      },
      {
        label: 'Opening Liabilities',
        value: data.summary?.openingLiabilities || 0,
        color: '#dc2626',
      },
      {
        label: 'Opening Equity',
        value: data.summary?.openingEquity || 0,
        color: '#059669',
      },
      {
        label: 'Opening Balance',
        value: data.summary?.openingBalance || 0,
        color: accentColor,
      },
    ];

    const periodItems = [
      {
        label: 'Period Assets',
        value: data.summary?.periodAssets || data.summary?.totalAssets || 0,
        color: primaryColor,
      },
      {
        label: 'Period Liabilities',
        value:
          data.summary?.periodLiabilities ||
          data.summary?.totalLiabilities ||
          0,
        color: '#dc2626',
      },
      {
        label: 'Period Equity',
        value: data.summary?.periodEquity || data.summary?.totalEquity || 0,
        color: '#059669',
      },
      {
        label: 'Period Balance',
        value: data.summary?.balance || 0,
        color: accentColor,
      },
    ];

    const closingItems = [
      {
        label: 'Closing Assets',
        value: data.summary?.closingAssets || 0,
        color: primaryColor,
      },
      {
        label: 'Closing Liabilities',
        value: data.summary?.closingLiabilities || 0,
        color: '#dc2626',
      },
      {
        label: 'Closing Equity',
        value: data.summary?.closingEquity || 0,
        color: '#059669',
      },
      {
        label: 'Closing Balance',
        value: data.summary?.closingBalance || 0,
        color: accentColor,
      },
    ];

    // Opening Balances
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(textDark)
      .text('Opening Balances', margin, doc.y);
    doc.y += 15;
    summaryItems.forEach((item, index) => {
      const cardX = margin + index * (cardWidth + 10);

      // Card background with rounded corners effect
      doc
        .rect(cardX, doc.y, cardWidth, cardHeight)
        .fillColor('#ffffff')
        .fill()
        .strokeColor(borderColor)
        .lineWidth(1)
        .stroke();

      // Top accent line
      doc.rect(cardX, doc.y, cardWidth, 3).fillColor(item.color).fill();

      // Label
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(textMuted)
        .text(item.label.toUpperCase(), cardX + 8, doc.y + 12, {
          width: cardWidth - 16,
          align: 'left',
        });

      // Value
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor(textDark)
        .text(
          this.formatCurrency(item.value, currency),
          cardX + 8,
          doc.y + 28,
          {
            width: cardWidth - 16,
            align: 'left',
          },
        );
    });

    doc.y += cardHeight + 20;

    // Period Transactions
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(textDark)
      .text('Period Transactions', margin, doc.y);
    doc.y += 15;
    periodItems.forEach((item, index) => {
      const cardX = margin + index * (cardWidth + 10);

      doc
        .rect(cardX, doc.y, cardWidth, cardHeight)
        .fillColor('#ffffff')
        .fill()
        .strokeColor(borderColor)
        .lineWidth(1)
        .stroke();

      doc.rect(cardX, doc.y, cardWidth, 3).fillColor(item.color).fill();

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(textMuted)
        .text(item.label.toUpperCase(), cardX + 8, doc.y + 12, {
          width: cardWidth - 16,
          align: 'left',
        });

      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor(textDark)
        .text(
          this.formatCurrency(item.value, currency),
          cardX + 8,
          doc.y + 28,
          {
            width: cardWidth - 16,
            align: 'left',
          },
        );
    });

    doc.y += cardHeight + 20;

    // Closing Balances
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(textDark)
      .text('Closing Balances', margin, doc.y);
    doc.y += 15;
    closingItems.forEach((item, index) => {
      const cardX = margin + index * (cardWidth + 10);

      doc
        .rect(cardX, doc.y, cardWidth, cardHeight)
        .fillColor('#ffffff')
        .fill()
        .strokeColor(borderColor)
        .lineWidth(2)
        .strokeColor(primaryColor)
        .stroke();

      doc.rect(cardX, doc.y, cardWidth, 3).fillColor(item.color).fill();

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(textMuted)
        .text(item.label.toUpperCase(), cardX + 8, doc.y + 12, {
          width: cardWidth - 16,
          align: 'left',
        });

      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor(textDark)
        .text(
          this.formatCurrency(item.value, currency),
          cardX + 8,
          doc.y + 28,
          {
            width: cardWidth - 16,
            align: 'left',
          },
        );
    });

    doc.y += cardHeight + 25;

    // ============ ASSETS SECTION ============
    this.addBalanceSheetSection(
      doc,
      'Assets',
      'Expense Categories',
      data.assets?.items || [],
      ['category', 'amount'],
      ['Category', 'Amount'],
      data.assets?.total || 0,
      currency,
      primaryColor,
      margin,
      contentWidth,
    );

    doc.y += 20;

    // Check if we need a new page
    if (doc.y > doc.page.height - 250) {
      doc.addPage();
      doc.y = 50;
    }

    // ============ LIABILITIES SECTION ============
    this.addBalanceSheetSection(
      doc,
      'Liabilities',
      'Pending Settlements',
      data.liabilities?.items || [],
      ['vendor', 'amount', 'status'],
      ['Vendor', 'Amount', 'Status'],
      data.liabilities?.total || 0,
      currency,
      '#dc2626',
      margin,
      contentWidth,
    );

    doc.y += 20;

    // Check if we need a new page
    if (doc.y > doc.page.height - 180) {
      doc.addPage();
      doc.y = 50;
    }

    // ============ EQUITY SECTION ============
    this.addBalanceSheetEquitySection(
      doc,
      data.equity,
      currency,
      '#059669',
      margin,
      contentWidth,
    );
  }

  /**
   * Render a section of the balance sheet (Assets or Liabilities)
   */
  private addBalanceSheetSection(
    doc: PDFKit.PDFDocument,
    title: string,
    subtitle: string,
    items: any[],
    columns: string[],
    headers: string[],
    total: number,
    currency: string,
    accentColor: string,
    margin: number,
    contentWidth: number,
  ): void {
    const borderColor = '#e1e8ed';
    const textDark = '#1a1a1a';
    const altRowBg = '#f8fafc';

    // Section header with accent bar
    const headerHeight = 35;
    const sectionHeaderY = doc.y;
    doc
      .rect(margin, sectionHeaderY, contentWidth, headerHeight)
      .fillColor('#f8fafc')
      .fill();
    doc
      .rect(margin, sectionHeaderY, 4, headerHeight)
      .fillColor(accentColor)
      .fill();

    doc.fontSize(14).font('Helvetica-Bold').fillColor(textDark);
    const titleWidth = doc.widthOfString(title);
    doc.text(title, margin + 15, sectionHeaderY + 10, { lineBreak: false });

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#6b7280')
      .text(subtitle, margin + 15 + titleWidth + 10, sectionHeaderY + 13, {
        lineBreak: false,
      });

    doc.y = sectionHeaderY + headerHeight + 10;

    if (items.length === 0) {
      doc
        .fontSize(10)
        .font('Helvetica-Oblique')
        .fillColor('#9ca3af')
        .text('No data available', margin + 15, doc.y);
      doc.y += 25;
      return;
    }

    // Table header
    const colWidths = this.calculateColumnWidths(columns, contentWidth - 10);
    const tableHeaderHeight = 28;
    const headerY = doc.y;
    doc
      .rect(margin + 5, headerY, contentWidth - 10, tableHeaderHeight)
      .fillColor(accentColor)
      .fill();

    let x = margin + 15;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff');
    headers.forEach((header, i) => {
      const isNumeric = columns[i] === 'amount';
      doc.text(header, x, headerY + 9, {
        width: colWidths[i] - 20,
        align: isNumeric ? 'right' : 'left',
        lineBreak: false,
      });
      x += colWidths[i];
    });

    doc.y = headerY + tableHeaderHeight;

    // Table rows
    const rowHeight = 28;
    items.forEach((item: any, index: number) => {
      // Check page overflow (check BEFORE adding the row to prevent overflow)
      if (doc.y + rowHeight > doc.page.height - 80) {
        doc.addPage();
        doc.y = 50;

        // Redraw table header on new page
        const newHeaderY = doc.y;
        doc
          .rect(margin + 5, newHeaderY, contentWidth - 10, tableHeaderHeight)
          .fillColor(accentColor)
          .fill();
        let headerX = margin + 15;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff');
        headers.forEach((header, i) => {
          const isNumeric = columns[i] === 'amount';
          doc.text(header, headerX, newHeaderY + 9, {
            width: colWidths[i] - 20,
            align: isNumeric ? 'right' : 'left',
            lineBreak: false,
          });
          headerX += colWidths[i];
        });
        doc.y = newHeaderY + tableHeaderHeight;
      }

      const rowY = doc.y; // Save row Y position

      // Alternating row background
      if (index % 2 === 0) {
        doc
          .rect(margin + 5, rowY, contentWidth - 10, rowHeight)
          .fillColor(altRowBg)
          .fill();
      }

      // Row border
      doc.strokeColor(borderColor).lineWidth(0.5);
      doc
        .moveTo(margin + 5, rowY + rowHeight)
        .lineTo(margin + contentWidth - 5, rowY + rowHeight)
        .stroke();

      x = margin + 15;
      doc.fontSize(9).font('Helvetica').fillColor(textDark);
      columns.forEach((col, i) => {
        const isNumeric = col === 'amount';
        let value = item[col];

        if (isNumeric) {
          value = this.formatCurrency(Number(value) || 0, currency);
        } else if (col === 'status') {
          value = this.formatStatus(value);
        } else {
          value = String(value || 'N/A');
        }

        doc.text(value, x, rowY + 9, {
          width: colWidths[i] - 20,
          align: isNumeric ? 'right' : 'left',
          lineBreak: false,
          ellipsis: true,
        });
        x += colWidths[i];
      });

      doc.y = rowY + rowHeight;
    });

    // Total row
    const totalRowHeight = 30;
    const totalY = doc.y;
    doc
      .rect(margin + 5, totalY, contentWidth - 10, totalRowHeight)
      .fillColor('#f0f7fc')
      .fill();
    doc.strokeColor(accentColor).lineWidth(1);
    doc
      .moveTo(margin + 5, totalY)
      .lineTo(margin + contentWidth - 5, totalY)
      .stroke();

    doc.fontSize(10).font('Helvetica-Bold').fillColor(textDark);
    doc.text('Total', margin + 15, totalY + 10, { lineBreak: false });
    doc.text(this.formatCurrency(total, currency), margin + 15, totalY + 10, {
      width: contentWidth - 40,
      align: 'right',
      lineBreak: false,
    });

    doc.y = totalY + totalRowHeight;
  }

  /**
   * Render the Equity section
   */
  private addBalanceSheetEquitySection(
    doc: PDFKit.PDFDocument,
    equity: any,
    currency: string,
    accentColor: string,
    margin: number,
    contentWidth: number,
  ): void {
    const borderColor = '#e1e8ed';
    const textDark = '#1a1a1a';

    // Section header
    const headerHeight = 35;
    const sectionHeaderY = doc.y;
    doc
      .rect(margin, sectionHeaderY, contentWidth, headerHeight)
      .fillColor('#f8fafc')
      .fill();
    doc
      .rect(margin, sectionHeaderY, 4, headerHeight)
      .fillColor(accentColor)
      .fill();

    doc.fontSize(14).font('Helvetica-Bold').fillColor(textDark);
    const titleWidth = doc.widthOfString('Equity');
    doc.text('Equity', margin + 15, sectionHeaderY + 10, { lineBreak: false });

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#6b7280')
      .text(
        'Revenue minus Expenses',
        margin + 15 + titleWidth + 10,
        sectionHeaderY + 13,
        { lineBreak: false },
      );

    doc.y = sectionHeaderY + headerHeight + 10;

    if (!equity) {
      doc
        .fontSize(10)
        .font('Helvetica-Oblique')
        .fillColor('#9ca3af')
        .text('No equity data available', margin + 15, doc.y);
      return;
    }

    // Equity breakdown card
    const cardWidth = (contentWidth - 20) / 3;
    const cardHeight = 55;
    const equityY = doc.y;

    const equityItems = [
      { label: 'Revenue', value: equity.revenue || 0, color: '#059669' },
      { label: 'Expenses', value: equity.expenses || 0, color: '#dc2626' },
      {
        label: 'Net Equity',
        value: equity.net || 0,
        color: accentColor,
        bold: true,
      },
    ];

    equityItems.forEach((item, index) => {
      const cardX = margin + 5 + index * (cardWidth + 5);

      // Card background
      doc
        .rect(cardX, equityY, cardWidth, cardHeight)
        .fillColor('#ffffff')
        .fill()
        .strokeColor(borderColor)
        .lineWidth(1)
        .stroke();

      // Left accent
      doc.rect(cardX, equityY, 3, cardHeight).fillColor(item.color).fill();

      // Label
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#6b7280')
        .text(item.label, cardX + 12, equityY + 12, {
          width: cardWidth - 24,
        });

      // Value
      const fontStyle = item.bold ? 'Helvetica-Bold' : 'Helvetica';
      const fontSize = item.bold ? 16 : 14;
      doc
        .fontSize(fontSize)
        .font(fontStyle)
        .fillColor(item.value < 0 ? '#dc2626' : textDark)
        .text(
          this.formatCurrency(item.value, currency),
          cardX + 12,
          equityY + 30,
          {
            width: cardWidth - 24,
          },
        );
    });

    doc.y = equityY + cardHeight + 10;
  }

  /**
   * Calculate column widths based on content type
   */
  private calculateColumnWidths(
    columns: string[],
    totalWidth: number,
  ): number[] {
    // Define relative widths for different column types
    const weights: { [key: string]: number } = {
      category: 3,
      vendor: 3,
      amount: 2,
      status: 1.5,
    };

    const totalWeight = columns.reduce(
      (sum, col) => sum + (weights[col] || 1),
      0,
    );
    return columns.map(
      (col) => ((weights[col] || 1) / totalWeight) * totalWidth,
    );
  }

  /**
   * Format status for display
   */
  private formatStatus(status: string): string {
    if (!status) return 'N/A';
    return status
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  /**
   * Professional Profit and Loss PDF Rendering
   */
  private addPDFProfitAndLoss(
    doc: PDFKit.PDFDocument,
    data: any,
    currency: string,
  ): void {
    const margin = 50;
    const contentWidth = doc.page.width - 2 * margin;
    const primaryColor = '#0077C8';
    const textDark = '#1a1a1a';
    const textMuted = '#6b7280';

    doc.y = 175;

    // Summary Cards
    const cardWidth = (contentWidth - 30) / 4;
    const cardHeight = 60;
    const cardY = doc.y;

    // Opening Retained Earnings
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(textDark)
      .text('Opening Retained Earnings', margin, doc.y);
    doc.moveDown(0.2);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(primaryColor)
      .text(
        this.formatCurrency(
          data.summary?.openingRetainedEarnings || 0,
          currency,
        ),
        margin,
      );
    doc.moveDown(0.5);

    const summaryItems = [
      {
        label: 'Revenue',
        value: data.summary?.grossProfit || data.revenue?.amount || 0,
        color: '#059669',
      },
      {
        label: 'Total Expenses',
        value: data.summary?.totalExpenses || data.expenses?.total || 0,
        color: '#dc2626',
      },
      {
        label: 'Net Profit',
        value: data.summary?.netProfit || 0,
        color: primaryColor,
      },
      {
        label: 'Profit Margin',
        value: `${(data.summary?.netProfitMargin || 0).toFixed(1)}%`,
        isPercent: true,
        color: '#7c3aed',
      },
    ];

    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(textDark)
      .text('Period Transactions', margin, doc.y);
    doc.moveDown(0.2);
    summaryItems.forEach((item, index) => {
      const cardX = margin + index * (cardWidth + 10);

      doc
        .rect(cardX, doc.y, cardWidth, cardHeight)
        .fillColor('#ffffff')
        .fill()
        .strokeColor('#e1e8ed')
        .lineWidth(1)
        .stroke();

      doc.rect(cardX, doc.y, cardWidth, 3).fillColor(item.color).fill();

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(textMuted)
        .text(item.label.toUpperCase(), cardX + 8, doc.y + 12, {
          width: cardWidth - 16,
        });

      const displayValue = item.isPercent
        ? item.value
        : this.formatCurrency(item.value as number, currency);
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor(textDark)
        .text(displayValue, cardX + 8, doc.y + 28, { width: cardWidth - 16 });
    });

    doc.y += cardHeight + 20;

    // Closing Retained Earnings
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(textDark)
      .text('Closing Retained Earnings', margin, doc.y);
    doc.moveDown(0.2);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(primaryColor)
      .text(
        this.formatCurrency(
          data.summary?.closingRetainedEarnings || 0,
          currency,
        ),
        margin,
      );
    doc.moveDown(0.5);

    // Revenue Section
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor(primaryColor)
      .text('Revenue', margin);
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor(textDark);
    doc.text(
      `Amount: ${this.formatCurrency(data.revenue?.netAmount || data.revenue?.amount || 0, currency)}`,
      margin,
    );
    doc.text(`Invoice Count: ${data.revenue?.count || 0}`, margin);
    doc.moveDown(0.5);

    // Expenses Section
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('#dc2626')
      .text('Expenses', margin);
    doc.moveDown(0.3);

    if (
      data.expenses?.items &&
      Array.isArray(data.expenses.items) &&
      data.expenses.items.length > 0
    ) {
      this.addPDFTable(
        doc,
        data.expenses.items,
        ['category', 'amount'],
        currency,
      );
    }

    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(textDark);
    doc.text(
      `Total Expenses: ${this.formatCurrency(data.expenses?.total || 0, currency)}`,
      margin,
    );
  }

  /**
   * Professional Receivables PDF Rendering
   */
  private addPDFReceivables(
    doc: PDFKit.PDFDocument,
    data: any,
    currency: string,
  ): void {
    const margin = 50;
    const contentWidth = doc.page.width - 2 * margin;
    const primaryColor = '#0077C8';
    const textDark = '#1a1a1a';
    const textMuted = '#6b7280';

    doc.y = 175;

    // Summary Cards
    const cardWidth = (contentWidth - 20) / 3;
    const cardHeight = 60;
    const cardY = doc.y;

    // Opening/Closing Balances
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(textDark)
      .text('Opening Balance', margin, doc.y);
    doc.moveDown(0.2);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(primaryColor)
      .text(
        this.formatCurrency(data.summary?.openingBalance || 0, currency),
        margin,
      );
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(textDark)
      .text('Period Outstanding', margin, doc.y);
    doc.moveDown(0.2);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(primaryColor)
      .text(
        this.formatCurrency(
          data.summary?.periodAmount || data.summary?.periodOutstanding || 0,
          currency,
        ),
        margin,
      );
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(textDark)
      .text('Closing Balance', margin, doc.y);
    doc.moveDown(0.2);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(primaryColor)
      .text(
        this.formatCurrency(data.summary?.closingBalance || 0, currency),
        margin,
      );
    doc.moveDown(0.5);

    const summaryItems = [
      {
        label: 'Total Outstanding',
        value: data.summary?.totalOutstanding || 0,
        color: primaryColor,
      },
      {
        label: 'Overdue Amount',
        value: data.summary?.overdueAmount || 0,
        color: '#dc2626',
      },
      {
        label: 'Total Invoices',
        value: data.summary?.totalInvoices || 0,
        isCount: true,
        color: '#059669',
      },
    ];

    summaryItems.forEach((item, index) => {
      const cardX = margin + index * (cardWidth + 10);

      doc
        .rect(cardX, doc.y, cardWidth, cardHeight)
        .fillColor('#ffffff')
        .fill()
        .strokeColor('#e1e8ed')
        .lineWidth(1)
        .stroke();

      doc.rect(cardX, doc.y, cardWidth, 3).fillColor(item.color).fill();

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(textMuted)
        .text(item.label.toUpperCase(), cardX + 8, doc.y + 12, {
          width: cardWidth - 16,
        });

      const displayValue = item.isCount
        ? String(item.value)
        : this.formatCurrency(item.value as number, currency);
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor(textDark)
        .text(displayValue, cardX + 8, doc.y + 28, { width: cardWidth - 16 });
    });

    doc.y += cardHeight + 25;

    // Summary Stats
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(primaryColor)
      .text('Invoice Status Summary', margin);
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor(textDark);
    doc.text(`Paid Invoices: ${data.summary?.paidInvoices || 0}`, margin);
    doc.text(`Unpaid Invoices: ${data.summary?.unpaidInvoices || 0}`, margin);
    doc.text(`Partial Invoices: ${data.summary?.partialInvoices || 0}`, margin);
    doc.text(`Overdue Invoices: ${data.summary?.overdueInvoices || 0}`, margin);
    doc.moveDown(0.5);

    // Items Table
    if (data.items && Array.isArray(data.items) && data.items.length > 0) {
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text('Outstanding Invoices', margin);
      doc.moveDown(0.3);
      this.addPDFTable(
        doc,
        data.items,
        [
          'invoiceNumber',
          'customer',
          'total',
          'outstanding',
          'dueDate',
          'paymentStatus',
        ],
        currency,
      );
    }
  }

  /**
   * Professional Payables PDF Rendering
   */
  private addPDFPayables(
    doc: PDFKit.PDFDocument,
    data: any,
    currency: string,
  ): void {
    const margin = 50;
    const contentWidth = doc.page.width - 2 * margin;
    const primaryColor = '#0077C8';
    const textDark = '#1a1a1a';
    const textMuted = '#6b7280';

    doc.y = 175;

    // Summary Cards
    const cardWidth = (contentWidth - 20) / 3;
    const cardHeight = 60;
    const cardY = doc.y;

    // Opening/Closing Balances
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(textDark)
      .text('Opening Balance', margin, doc.y);
    doc.moveDown(0.2);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(primaryColor)
      .text(
        this.formatCurrency(data.summary?.openingBalance || 0, currency),
        margin,
      );
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(textDark)
      .text('Period Amount', margin, doc.y);
    doc.moveDown(0.2);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(primaryColor)
      .text(
        this.formatCurrency(data.summary?.periodAmount || 0, currency),
        margin,
      );
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(textDark)
      .text('Closing Balance', margin, doc.y);
    doc.moveDown(0.2);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(primaryColor)
      .text(
        this.formatCurrency(data.summary?.closingBalance || 0, currency),
        margin,
      );
    doc.moveDown(0.5);

    const summaryItems = [
      {
        label: 'Total Payables',
        value: data.summary?.totalAmount || 0,
        color: primaryColor,
      },
      {
        label: 'Overdue Amount',
        value: data.summary?.overdueAmount || 0,
        color: '#dc2626',
      },
      {
        label: 'Total Items',
        value: data.summary?.totalItems || data.items?.length || 0,
        isCount: true,
        color: '#059669',
      },
    ];

    summaryItems.forEach((item, index) => {
      const cardX = margin + index * (cardWidth + 10);

      doc
        .rect(cardX, doc.y, cardWidth, cardHeight)
        .fillColor('#ffffff')
        .fill()
        .strokeColor('#e1e8ed')
        .lineWidth(1)
        .stroke();

      doc.rect(cardX, doc.y, cardWidth, 3).fillColor(item.color).fill();

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(textMuted)
        .text(item.label.toUpperCase(), cardX + 8, doc.y + 12, {
          width: cardWidth - 16,
        });

      const displayValue = item.isCount
        ? String(item.value)
        : this.formatCurrency(item.value as number, currency);
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor(textDark)
        .text(displayValue, cardX + 8, doc.y + 28, { width: cardWidth - 16 });
    });

    doc.y += cardHeight + 25;

    // Summary Stats
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(primaryColor)
      .text('Payables Summary', margin);
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor(textDark);
    doc.text(`As of Date: ${data.asOfDate || 'N/A'}`, margin);
    doc.text(`Pending Items: ${data.summary?.pendingItems || 0}`, margin);
    doc.text(`Overdue Items: ${data.summary?.overdueItems || 0}`, margin);
    doc.moveDown(0.5);

    // Items Table
    if (data.items && Array.isArray(data.items) && data.items.length > 0) {
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text('Pending Payables', margin);
      doc.moveDown(0.3);
      this.addPDFTable(
        doc,
        data.items,
        ['vendor', 'amount', 'expectedDate', 'status', 'category'],
        currency,
      );
    }

    // Supplier Summary Section
    if (
      data.supplierSummary &&
      Array.isArray(data.supplierSummary) &&
      data.supplierSummary.length > 0
    ) {
      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text('Supplier Summary (Pending Balances)', margin);
      doc.moveDown(0.3);

      const supplierTableData = data.supplierSummary.map((s: any) => ({
        vendor: s.vendor || 'N/A',
        pendingBalance: s.pendingBalance || 0,
        itemCount: s.itemCount || 0,
        overdueAmount: s.overdueAmount || 0,
        overdueCount: s.overdueCount || 0,
      }));

      this.addPDFTable(
        doc,
        supplierTableData,
        [
          'vendor',
          'pendingBalance',
          'itemCount',
          'overdueAmount',
          'overdueCount',
        ],
        currency,
      );
    }
  }

  /**
   * Professional VAT Control Account PDF Rendering
   */
  private addPDFVatControlAccount(
    doc: PDFKit.PDFDocument,
    data: any,
    currency: string,
  ): void {
    const margin = 50;
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - 2 * margin;

    // Brand colors
    const primaryColor = '#0077C8';
    const accentColor = '#00A3E0';
    const inputColor = '#dc2626'; // Red for input (expenses)
    const outputColor = '#059669'; // Green for output (sales)
    const borderColor = '#e1e8ed';
    const textDark = '#1a1a1a';
    const textMuted = '#6b7280';
    const headerBg = '#f0f7fc';
    const altRowBg = '#f8fafc';

    // Starting position
    doc.y = 175;

    // ============ SUMMARY CARDS SECTION ============
    const cardWidth = (contentWidth - 30) / 4; // 4 cards with gaps
    const cardHeight = 70;
    const cardY = doc.y;

    const summary = data.summary || {};
    const netVat = summary.netVat || 0;
    const netVatColor = netVat >= 0 ? outputColor : inputColor;

    const summaryItems = [
      {
        label: 'VAT Input',
        value: summary.vatInput || 0,
        color: inputColor,
        description: 'From Expenses/Purchases',
      },
      {
        label: 'VAT Output',
        value: summary.vatOutput || 0,
        color: outputColor,
        description: 'From Sales/Invoices',
      },
      {
        label: 'Net VAT',
        value: netVat,
        color: netVatColor,
        description: netVat >= 0 ? 'Payable to FTA' : 'Refundable from FTA',
        bold: true,
      },
      {
        label: 'Total Transactions',
        value: summary.totalTransactions || 0,
        color: primaryColor,
        description: `${summary.inputTransactions || 0} Input / ${summary.outputTransactions || 0} Output`,
        isCount: true,
      },
    ];

    summaryItems.forEach((item, index) => {
      const cardX = margin + index * (cardWidth + 10);

      // Card background with rounded corners effect
      doc
        .rect(cardX, cardY, cardWidth, cardHeight)
        .fillColor('#ffffff')
        .fill()
        .strokeColor(borderColor)
        .lineWidth(1)
        .stroke();

      // Top accent line
      doc.rect(cardX, cardY, cardWidth, 3).fillColor(item.color).fill();

      // Label
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(textMuted)
        .text(item.label.toUpperCase(), cardX + 8, cardY + 12, {
          width: cardWidth - 16,
          align: 'left',
        });

      // Value
      const displayValue = item.isCount
        ? String(item.value)
        : this.formatCurrency(item.value as number, currency);
      doc
        .fontSize(item.bold ? 16 : 14)
        .font(item.bold ? 'Helvetica-Bold' : 'Helvetica-Bold')
        .fillColor(textDark)
        .text(displayValue, cardX + 8, cardY + 28, {
          width: cardWidth - 16,
          align: 'left',
        });

      // Description
      if (item.description) {
        doc
          .fontSize(7)
          .font('Helvetica')
          .fillColor(textMuted)
          .text(item.description, cardX + 8, cardY + 50, {
            width: cardWidth - 16,
            align: 'left',
          });
      }
    });

    doc.y = cardY + cardHeight + 30;

    // ============ PERIOD INFORMATION ============
    if (data.startDate || data.endDate) {
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(textMuted)
        .text(
          `Report Period: ${data.startDate || 'N/A'} to ${data.endDate || 'N/A'}`,
          margin,
          doc.y,
        );
      doc.moveDown(0.5);
    }

    // ============ VAT INPUT SECTION ============
    if (
      data.vatInputItems &&
      Array.isArray(data.vatInputItems) &&
      data.vatInputItems.length > 0
    ) {
      // Section header
      const sectionHeaderY = doc.y;
      const headerHeight = 35;

      doc
        .rect(margin, sectionHeaderY, contentWidth, headerHeight)
        .fillColor(headerBg)
        .fill();
      doc
        .rect(margin, sectionHeaderY, 4, headerHeight)
        .fillColor(inputColor)
        .fill();

      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor(textDark)
        .text(
          'VAT Input (Purchases/Expenses)',
          margin + 15,
          sectionHeaderY + 10,
        );

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor(textMuted)
        .text(
          `Total: ${this.formatCurrency(summary.vatInput || 0, currency)} | ${data.vatInputItems.length} transactions`,
          margin + 15,
          sectionHeaderY + 25,
        );

      doc.y = sectionHeaderY + headerHeight + 10;

      // Table for VAT Input items
      this.addVATItemsTable(
        doc,
        data.vatInputItems,
        ['date', 'description', 'amount', 'vatRate', 'vatAmount', 'trn'],
        currency,
        margin,
        contentWidth,
        inputColor,
        altRowBg,
        borderColor,
        textDark,
        textMuted,
      );

      doc.moveDown(0.5);
    }

    // Check if we need a new page
    if (doc.y > doc.page.height - 200) {
      doc.addPage();
      doc.y = 50;
    }

    // ============ VAT OUTPUT SECTION ============
    if (
      data.vatOutputItems &&
      Array.isArray(data.vatOutputItems) &&
      data.vatOutputItems.length > 0
    ) {
      // Section header
      const sectionHeaderY = doc.y;
      const headerHeight = 35;

      doc
        .rect(margin, sectionHeaderY, contentWidth, headerHeight)
        .fillColor(headerBg)
        .fill();
      doc
        .rect(margin, sectionHeaderY, 4, headerHeight)
        .fillColor(outputColor)
        .fill();

      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor(textDark)
        .text('VAT Output (Sales/Invoices)', margin + 15, sectionHeaderY + 10);

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor(textMuted)
        .text(
          `Total: ${this.formatCurrency(summary.vatOutput || 0, currency)} | ${data.vatOutputItems.length} transactions`,
          margin + 15,
          sectionHeaderY + 25,
        );

      doc.y = sectionHeaderY + headerHeight + 10;

      // Table for VAT Output items
      this.addVATItemsTable(
        doc,
        data.vatOutputItems,
        ['date', 'description', 'amount', 'vatRate', 'vatAmount', 'trn'],
        currency,
        margin,
        contentWidth,
        outputColor,
        altRowBg,
        borderColor,
        textDark,
        textMuted,
      );
    } else if (!data.vatInputItems || data.vatInputItems.length === 0) {
      // No data message
      doc
        .fontSize(10)
        .font('Helvetica-Oblique')
        .fillColor(textMuted)
        .text('No VAT transactions found for the selected period.', margin);
    }
  }

  /**
   * Helper method to render VAT items table
   */
  private addVATItemsTable(
    doc: PDFKit.PDFDocument,
    items: any[],
    columns: string[],
    currency: string,
    margin: number,
    contentWidth: number,
    accentColor: string,
    altRowBg: string,
    borderColor: string,
    textDark: string,
    textMuted: string,
  ): void {
    if (!items || items.length === 0) return;

    // Column widths
    const colWidths = [
      contentWidth * 0.12, // Date
      contentWidth * 0.28, // Description
      contentWidth * 0.15, // Amount
      contentWidth * 0.1, // VAT Rate
      contentWidth * 0.15, // VAT Amount
      contentWidth * 0.2, // TRN
    ];

    // Table header dimensions
    const headerHeight = 28;
    const rowHeight = 22;

    // Check if header fits on current page, add new page if needed
    if (doc.y + headerHeight + rowHeight > doc.page.height - 60) {
      doc.addPage();
      doc.y = 50;
    }
    // Table header
    const headerY = doc.y;

    doc
      .rect(margin, headerY, contentWidth, headerHeight)
      .fillColor(accentColor)
      .fill();

    doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#ffffff');

    const headers = [
      'Date',
      'Description',
      'Amount',
      'VAT Rate',
      'VAT Amount',
      'TRN',
    ];
    let x = margin + 8;
    headers.forEach((header, i) => {
      doc.text(header, x, headerY + 8, {
        width: colWidths[i] - 16,
        align: i >= 2 ? 'right' : 'left',
      });
      x += colWidths[i];
    });

    doc.fillColor(textDark);

    // Data rows
    let rowY = headerY + headerHeight;

    items.forEach((item, index) => {
      // Check if we need a new page (check BEFORE adding the row to prevent overflow)
      if (rowY + rowHeight > doc.page.height - 100) {
        doc.addPage();
        rowY = 50;
        doc.y = rowY; // Sync doc.y with rowY position

        // Re-draw header on new page
        doc
          .rect(margin, rowY, contentWidth, headerHeight)
          .fillColor(accentColor)
          .fill();
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#ffffff');
        x = margin + 8;
        headers.forEach((header, i) => {
          doc.text(header, x, rowY + 8, {
            width: colWidths[i] - 16,
            align: i >= 2 ? 'right' : 'left',
          });
          x += colWidths[i];
        });
        doc.fillColor(textDark);
        rowY += headerHeight;
        doc.y = rowY; // Sync doc.y after header
      }

      // Alternate row background
      if (index % 2 === 1) {
        doc
          .rect(margin, rowY, contentWidth, rowHeight)
          .fillColor(altRowBg)
          .fill();
      }

      // Row border
      doc
        .strokeColor(borderColor)
        .lineWidth(0.5)
        .moveTo(margin, rowY)
        .lineTo(margin + contentWidth, rowY)
        .stroke();

      doc.fontSize(9).font('Helvetica');
      x = margin + 8;

      // Date
      const dateStr = item.date
        ? new Date(item.date).toLocaleDateString('en-GB')
        : 'N/A';
      doc.text(dateStr, x, rowY + 7, {
        width: colWidths[0] - 16,
        align: 'left',
      });
      x += colWidths[0];

      // Description
      const desc =
        item.description ||
        item.vendorName ||
        item.customerName ||
        item.invoiceNumber ||
        'N/A';
      doc.text(desc.substring(0, 40), x, rowY + 7, {
        width: colWidths[1] - 16,
        align: 'left',
        ellipsis: true,
      });
      x += colWidths[1];

      // Amount
      doc.text(this.formatCurrency(item.amount || 0, currency), x, rowY + 7, {
        width: colWidths[2] - 16,
        align: 'right',
      });
      x += colWidths[2];

      // VAT Rate
      doc.text(`${item.vatRate || 0}%`, x, rowY + 7, {
        width: colWidths[3] - 16,
        align: 'right',
      });
      x += colWidths[3];

      // VAT Amount
      doc.font('Helvetica-Bold');
      doc.text(
        this.formatCurrency(item.vatAmount || 0, currency),
        x,
        rowY + 7,
        {
          width: colWidths[4] - 16,
          align: 'right',
        },
      );
      doc.font('Helvetica');
      x += colWidths[4];

      // TRN
      doc.fillColor(textMuted);
      doc.text(item.trn || 'N/A', x, rowY + 7, {
        width: colWidths[5] - 16,
        align: 'left',
      });
      doc.fillColor(textDark);

      rowY += rowHeight;
    });

    // Total row
    const totalRowHeight = 28;
    const totalY = rowY;
    doc
      .rect(margin, totalY, contentWidth, totalRowHeight)
      .fillColor('#f0f7fc')
      .fill();

    doc
      .strokeColor(accentColor)
      .lineWidth(1.5)
      .moveTo(margin, totalY)
      .lineTo(margin + contentWidth, totalY)
      .stroke();

    const totalVat = items.reduce(
      (sum, item) => sum + (item.vatAmount || 0),
      0,
    );
    const totalAmount = items.reduce(
      (sum, item) => sum + (item.amount || 0),
      0,
    );

    doc.fontSize(10).font('Helvetica-Bold').fillColor(textDark);

    x = margin + 8;
    doc.text('Total', x, totalY + 9, {
      width: colWidths[0] + colWidths[1] - 16,
      align: 'left',
    });
    x += colWidths[0] + colWidths[1];

    doc.text(this.formatCurrency(totalAmount, currency), x, totalY + 9, {
      width: colWidths[2] - 16,
      align: 'right',
    });
    x += colWidths[2];

    doc.text('', x, totalY + 9, { width: colWidths[3] - 16 }); // Skip VAT Rate column
    x += colWidths[3];

    doc.text(this.formatCurrency(totalVat, currency), x, totalY + 9, {
      width: colWidths[4] - 16,
      align: 'right',
    });

    doc.y = totalY + totalRowHeight + 10;
  }

  /**
   * Professional Stock Balance PDF Rendering
   */
  private addPDFStockBalance(
    doc: PDFKit.PDFDocument,
    data: any,
    currency: string,
  ): void {
    const margin = 50;
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - 2 * margin;

    // Brand colors
    const primaryColor = '#0077C8';
    const accentColor = '#00A3E0';
    const borderColor = '#e1e8ed';
    const textDark = '#1a1a1a';
    const textMuted = '#6b7280';
    const headerBg = '#f0f7fc';
    const altRowBg = '#f8fafc';
    const positiveColor = '#059669';
    const negativeColor = '#dc2626';

    // Starting position
    doc.y = 175;

    // Period information
    if (data.period) {
      doc.fontSize(9).font('Helvetica').fillColor(textMuted);
      if (data.period.startDate) {
        doc.text(
          `From: ${new Date(data.period.startDate).toLocaleDateString('en-GB')}`,
          margin,
        );
        doc.y += 12;
      }
      if (data.period.endDate) {
        doc.text(
          `To: ${new Date(data.period.endDate).toLocaleDateString('en-GB')}`,
          margin,
        );
        doc.y += 12;
      }
      doc.y += 8;
    }

    // Summary cards
    const summary = data.summary || {};
    const cardWidth = (contentWidth - 30) / 6;
    const cardHeight = 70;
    const cardY = doc.y;

    const summaryItems = [
      {
        label: 'Opening Stock',
        value: summary.totalOpeningStock || 0,
        color: primaryColor,
      },
      {
        label: 'Stock Inwards',
        value: summary.totalStockInwards || 0,
        color: positiveColor,
      },
      {
        label: 'Stock Outwards',
        value: summary.totalStockOutwards || 0,
        color: negativeColor,
      },
      {
        label: 'Adjustments',
        value: summary.totalAdjustments || 0,
        color: accentColor,
      },
      {
        label: 'Closing Stock',
        value: summary.totalClosingStock || 0,
        color: primaryColor,
        bold: true,
      },
      {
        label: 'Stock Value',
        value: summary.totalStockValue || 0,
        color: primaryColor,
        bold: true,
        isCurrency: true,
      },
    ];

    summaryItems.forEach((item, index) => {
      const cardX = margin + index * (cardWidth + 5);

      // Card background
      doc
        .rect(cardX, cardY, cardWidth, cardHeight)
        .fillColor('#ffffff')
        .fill()
        .strokeColor(borderColor)
        .lineWidth(1)
        .stroke();

      // Top accent line
      doc.rect(cardX, cardY, cardWidth, 3).fillColor(item.color).fill();

      // Label
      doc
        .fontSize(7)
        .font('Helvetica')
        .fillColor(textMuted)
        .text(item.label.toUpperCase(), cardX + 6, cardY + 10, {
          width: cardWidth - 12,
          align: 'left',
        });

      // Value
      const displayValue = item.isCurrency
        ? this.formatCurrency(item.value as number, currency)
        : (item.value as number).toFixed(2);
      doc
        .fontSize(item.bold ? 12 : 10)
        .font(item.bold ? 'Helvetica-Bold' : 'Helvetica-Bold')
        .fillColor(textDark)
        .text(displayValue, cardX + 6, cardY + 24, {
          width: cardWidth - 12,
          align: 'left',
        });
    });

    doc.y = cardY + cardHeight + 20;

    // Products table
    if (
      data.products &&
      Array.isArray(data.products) &&
      data.products.length > 0
    ) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor(textDark);
      doc.text('Product Stock Details', margin, doc.y);
      doc.y += 15;

      // Column widths for landscape
      const colWidths = [
        contentWidth * 0.18, // Product Name
        contentWidth * 0.08, // Unit
        contentWidth * 0.1, // Opening Stock
        contentWidth * 0.1, // Stock Inwards
        contentWidth * 0.1, // Stock Outwards
        contentWidth * 0.1, // Adjustments
        contentWidth * 0.1, // Closing Stock
        contentWidth * 0.12, // Avg Cost
        contentWidth * 0.12, // Stock Value
      ];

      const headerHeight = 28;
      const rowHeight = 22;

      // Check if header fits
      if (doc.y + headerHeight + rowHeight > doc.page.height - 60) {
        doc.addPage();
        doc.y = 50;
      }

      const headerY = doc.y;

      // Table header
      doc
        .rect(margin, headerY, contentWidth, headerHeight)
        .fillColor(accentColor)
        .fill();

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff');

      const headers = [
        'Product',
        'Unit',
        'Opening',
        'Inwards',
        'Outwards',
        'Adjust',
        'Closing',
        'Avg Cost',
        'Value',
      ];
      let x = margin + 6;
      headers.forEach((header, i) => {
        doc.text(header, x, headerY + 9, {
          width: colWidths[i] - 12,
          align: i >= 2 ? 'right' : 'left',
        });
        x += colWidths[i];
      });

      doc.fillColor(textDark);

      // Data rows
      let rowY = headerY + headerHeight;

      data.products.forEach((product: any, index: number) => {
        // Check if new page needed
        if (rowY + rowHeight > doc.page.height - 100) {
          doc.addPage();
          rowY = 50;
          doc.y = rowY;

          // Re-draw header
          doc
            .rect(margin, rowY, contentWidth, headerHeight)
            .fillColor(accentColor)
            .fill();
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff');
          x = margin + 6;
          headers.forEach((header, i) => {
            doc.text(header, x, rowY + 9, {
              width: colWidths[i] - 12,
              align: i >= 2 ? 'right' : 'left',
            });
            x += colWidths[i];
          });
          doc.fillColor(textDark);
          rowY += headerHeight;
          doc.y = rowY;
        }

        // Alternate row background
        if (index % 2 === 1) {
          doc
            .rect(margin, rowY, contentWidth, rowHeight)
            .fillColor(altRowBg)
            .fill();
        }

        // Row border
        doc
          .strokeColor(borderColor)
          .lineWidth(0.5)
          .moveTo(margin, rowY)
          .lineTo(margin + contentWidth, rowY)
          .stroke();

        doc.fontSize(8.5).font('Helvetica');
        x = margin + 6;

        // Product Name
        doc.fillColor(textDark);
        doc.text(product.productName || 'N/A', x, rowY + 7, {
          width: colWidths[0] - 12,
          align: 'left',
        });
        x += colWidths[0];

        // Unit
        doc.fillColor(textMuted);
        doc.text(product.unitOfMeasure || 'unit', x, rowY + 7, {
          width: colWidths[1] - 12,
          align: 'left',
        });
        x += colWidths[1];

        // Opening Stock
        doc.fillColor(textDark);
        doc.text((product.openingStock || 0).toFixed(2), x, rowY + 7, {
          width: colWidths[2] - 12,
          align: 'right',
        });
        x += colWidths[2];

        // Stock Inwards
        doc.fillColor(positiveColor);
        doc.text((product.stockInwards || 0).toFixed(2), x, rowY + 7, {
          width: colWidths[3] - 12,
          align: 'right',
        });
        x += colWidths[3];

        // Stock Outwards
        doc.fillColor(negativeColor);
        doc.text((product.stockOutwards || 0).toFixed(2), x, rowY + 7, {
          width: colWidths[4] - 12,
          align: 'right',
        });
        x += colWidths[4];

        // Adjustments
        const adjColor =
          (product.adjustments || 0) >= 0 ? positiveColor : negativeColor;
        doc.fillColor(adjColor);
        doc.text((product.adjustments || 0).toFixed(2), x, rowY + 7, {
          width: colWidths[5] - 12,
          align: 'right',
        });
        x += colWidths[5];

        // Closing Stock
        doc.font('Helvetica-Bold').fillColor(textDark);
        doc.text((product.closingStock || 0).toFixed(2), x, rowY + 7, {
          width: colWidths[6] - 12,
          align: 'right',
        });
        x += colWidths[6];

        // Average Cost
        doc.font('Helvetica').fillColor(textMuted);
        doc.text(
          this.formatCurrency(product.averageCost || 0, currency),
          x,
          rowY + 7,
          {
            width: colWidths[7] - 12,
            align: 'right',
          },
        );
        x += colWidths[7];

        // Stock Value
        doc.font('Helvetica-Bold').fillColor(textDark);
        doc.text(
          this.formatCurrency(product.stockValue || 0, currency),
          x,
          rowY + 7,
          {
            width: colWidths[8] - 12,
            align: 'right',
          },
        );

        doc.font('Helvetica');
        rowY += rowHeight;
      });

      // Total row
      const totalRowHeight = 28;
      const totalY = rowY;
      doc
        .rect(margin, totalY, contentWidth, totalRowHeight)
        .fillColor(headerBg)
        .fill();

      doc
        .strokeColor(accentColor)
        .lineWidth(1.5)
        .moveTo(margin, totalY)
        .lineTo(margin + contentWidth, totalY)
        .stroke();

      doc.fontSize(9.5).font('Helvetica-Bold').fillColor(textDark);

      x = margin + 6;
      doc.text('TOTAL', x, totalY + 9, {
        width: colWidths[0] + colWidths[1] - 12,
        align: 'left',
      });
      x += colWidths[0] + colWidths[1];

      doc.text((summary.totalOpeningStock || 0).toFixed(2), x, totalY + 9, {
        width: colWidths[2] - 12,
        align: 'right',
      });
      x += colWidths[2];

      doc.fillColor(positiveColor);
      doc.text((summary.totalStockInwards || 0).toFixed(2), x, totalY + 9, {
        width: colWidths[3] - 12,
        align: 'right',
      });
      x += colWidths[3];

      doc.fillColor(negativeColor);
      doc.text((summary.totalStockOutwards || 0).toFixed(2), x, totalY + 9, {
        width: colWidths[4] - 12,
        align: 'right',
      });
      x += colWidths[4];

      const adjTotalColor =
        (summary.totalAdjustments || 0) >= 0 ? positiveColor : negativeColor;
      doc.fillColor(adjTotalColor);
      doc.text((summary.totalAdjustments || 0).toFixed(2), x, totalY + 9, {
        width: colWidths[5] - 12,
        align: 'right',
      });
      x += colWidths[5];

      doc.fillColor(textDark);
      doc.text((summary.totalClosingStock || 0).toFixed(2), x, totalY + 9, {
        width: colWidths[6] - 12,
        align: 'right',
      });
      x += colWidths[6];

      doc.fillColor(textMuted);
      doc.text('', x, totalY + 9, { width: colWidths[7] - 12 }); // Skip avg cost
      x += colWidths[7];

      doc.fillColor(textDark);
      doc.text(
        this.formatCurrency(summary.totalStockValue || 0, currency),
        x,
        totalY + 9,
        {
          width: colWidths[8] - 12,
          align: 'right',
        },
      );

      doc.y = totalY + totalRowHeight + 10;
    } else {
      doc.fontSize(10).font('Helvetica').fillColor(textMuted);
      doc.text(
        'No stock movements found for the selected period.',
        margin,
        doc.y,
      );
      doc.y += 15;
    }

    // Validation note
    if (summary.totalStockValue > 0) {
      doc.y += 10;
      doc.fontSize(8).font('Helvetica').fillColor(textMuted);
      doc.text(
        `Note: Total stock value (${this.formatCurrency(summary.totalStockValue, currency)}) should match the "Closing Stock (Inventory)" amount in the Balance Sheet report for the same date.`,
        margin,
        doc.y,
        {
          width: contentWidth,
          align: 'left',
        },
      );
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

    // Header - Professional clean styling
    // Check if header fits on current page, add new page if needed
    if (doc.y + 45 > doc.page.height - 60) {
      doc.addPage();
      doc.y = 50;
    }
    const headerY = doc.y;
    doc
      .rect(margin, headerY, availableWidth, 25)
      .fillColor('#fafafa')
      .fill()
      .strokeColor('#e0e0e0')
      .lineWidth(0.5)
      .stroke();

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1a1a1a');
    let x = margin + 5;
    columns.forEach((col) => {
      doc.text(this.formatHeaderLabel(col), x, headerY + 8, {
        width: colWidth - 10,
        align: this.getColumnAlignment(col),
      });
      x += colWidth;
    });
    doc.fillColor('#1a1a1a');

    // Rows
    let rowY = headerY + 25;
    data.forEach((row: any, index: number) => {
      // Check if we need a new page (check BEFORE adding the row to prevent overflow)
      if (rowY + 20 > doc.page.height - 80) {
        doc.addPage();
        // Start table at top of new page (with some margin)
        rowY = 50;
        doc.y = rowY; // Sync doc.y with rowY position
        // Redraw table column header
        doc
          .rect(margin, rowY, availableWidth, 25)
          .fillColor('#fafafa')
          .fill()
          .strokeColor('#e0e0e0')
          .lineWidth(0.5)
          .stroke();
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1a1a1a');
        x = margin + 5;
        columns.forEach((col) => {
          doc.text(this.formatHeaderLabel(col), x, rowY + 8, {
            width: colWidth - 10,
            align: this.getColumnAlignment(col),
          });
          x += colWidth;
        });
        doc.fillColor('#1a1a1a');
        rowY += 25;
        doc.y = rowY; // Sync doc.y after header
      }

      // Draw row borders for clean professional look
      doc.strokeColor('#e0e0e0').lineWidth(0.5);
      doc.rect(margin, rowY, availableWidth, 20).stroke();

      if (index % 2 === 0) {
        doc.rect(margin, rowY, availableWidth, 20).fillColor('#fafafa').fill();
      }

      // Reset fill color to black for text
      doc.fillColor('#1a1a1a').fontSize(9).font('Helvetica');
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

  /**
   * Add General Ledger report to PDF
   */
  private addPDFGeneralLedger(
    doc: PDFKit.PDFDocument,
    data: any,
    currency: string,
  ): void {
    const margin = 40;
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - 2 * margin;

    doc.y = 175;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1a1a1a');

    if (data.period) {
      doc.text(
        `Period: ${data.period.startDate} to ${data.period.endDate}`,
        margin,
        doc.y,
      );
      doc.y += 15;
    }

    if (data.accounts && Array.isArray(data.accounts)) {
      data.accounts.forEach((account: any, accountIndex: number) => {
        // Check if we need a new page
        if (doc.y > doc.page.height - 150) {
          doc.addPage();
          doc.y = 50;
        }

        // Account header
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a1a1a');
        doc.text(account.accountName || account.accountCode, margin, doc.y);
        doc.y += 12;

        doc.fontSize(9).font('Helvetica').fillColor('#666666');
        doc.text(
          `Category: ${account.accountCategory || 'N/A'}`,
          margin,
          doc.y,
        );
        doc.y += 10;

        doc.fontSize(9).font('Helvetica-Bold');
        doc.text(
          `Opening Balance: ${this.formatCurrency(account.openingBalance || 0, currency)}`,
          margin,
          doc.y,
        );
        doc.y += 10;
        doc.text(
          `Closing Balance: ${this.formatCurrency(account.closingBalance || 0, currency)}`,
          margin,
          doc.y,
        );
        doc.y += 15;

        // Transactions table
        if (account.transactions && account.transactions.length > 0) {
          // Table header
          const headerY = doc.y;
          doc
            .rect(margin, headerY, contentWidth, 20)
            .fillColor('#0f172a')
            .fill()
            .strokeColor('#0f172a')
            .lineWidth(0.5)
            .stroke();

          doc.fontSize(7).font('Helvetica-Bold').fillColor('#ffffff');
          const colWidths = [
            contentWidth * 0.12, // Date
            contentWidth * 0.30, // Description
            contentWidth * 0.15, // Reference
            contentWidth * 0.13, // Source
            contentWidth * 0.10, // Debit
            contentWidth * 0.10, // Credit
            contentWidth * 0.10, // Balance
          ];

          let x = margin + 3;
          const headers = ['Date', 'Description', 'Reference', 'Source', 'Debit', 'Credit', 'Balance'];
          headers.forEach((header, index) => {
            doc.text(header, x, headerY + 6, {
              width: colWidths[index] - 6,
              align: index >= 4 ? 'right' : 'left',
            });
            x += colWidths[index];
          });

          doc.y = headerY + 20;

          // Transaction rows
          account.transactions.forEach((transaction: any, txIndex: number) => {
            // Check if we need a new page
            if (doc.y > doc.page.height - 40) {
              doc.addPage();
              doc.y = 50;
              // Redraw header on new page
              const newHeaderY = doc.y;
              doc
                .rect(margin, newHeaderY, contentWidth, 20)
                .fillColor('#0f172a')
                .fill()
                .strokeColor('#0f172a')
                .lineWidth(0.5)
                .stroke();

              doc.fontSize(7).font('Helvetica-Bold').fillColor('#ffffff');
              x = margin + 3;
              headers.forEach((header, index) => {
                doc.text(header, x, newHeaderY + 6, {
                  width: colWidths[index] - 6,
                  align: index >= 4 ? 'right' : 'left',
                });
                x += colWidths[index];
              });
              doc.y = newHeaderY + 20;
            }

            const rowY = doc.y;
            doc.fontSize(7).font('Helvetica').fillColor('#1a1a1a');

            // Date
            x = margin + 3;
            doc.text(transaction.date || '', x, rowY, {
              width: colWidths[0] - 6,
              align: 'left',
            });
            x += colWidths[0];

            // Description
            doc.text(transaction.description || '', x, rowY, {
              width: colWidths[1] - 6,
              align: 'left',
            });
            x += colWidths[1];

            // Reference
            doc.text(transaction.referenceNumber || '', x, rowY, {
              width: colWidths[2] - 6,
              align: 'left',
            });
            x += colWidths[2];

            // Source
            doc.text(transaction.source || '', x, rowY, {
              width: colWidths[3] - 6,
              align: 'left',
            });
            x += colWidths[3];

            // Debit
            doc.text(
              this.formatCurrency(transaction.debitAmount || 0, currency),
              x,
              rowY,
              {
                width: colWidths[4] - 6,
                align: 'right',
              },
            );
            x += colWidths[4];

            // Credit
            doc.text(
              this.formatCurrency(transaction.creditAmount || 0, currency),
              x,
              rowY,
              {
                width: colWidths[5] - 6,
                align: 'right',
              },
            );
            x += colWidths[5];

            // Balance
            doc.font('Helvetica-Bold');
            doc.text(
              this.formatCurrency(transaction.runningBalance || 0, currency),
              x,
              rowY,
              {
                width: colWidths[6] - 6,
                align: 'right',
              },
            );
            doc.font('Helvetica');

            // Row border
            doc
              .moveTo(margin, rowY + 14)
              .lineTo(margin + contentWidth, rowY + 14)
              .strokeColor('#e5e7eb')
              .lineWidth(0.3)
              .stroke();

            doc.y += 14;
          });
        } else {
          doc.fontSize(8).font('Helvetica').fillColor('#666666');
          doc.text('No transactions in this period', margin, doc.y);
          doc.y += 10;
        }

        doc.y += 20; // Space between accounts
      });
    }
  }

  /**
   * Custom table rendering for Trial Balance with smaller fonts to prevent collisions
   */
  private addTrialBalanceTable(
    doc: PDFKit.PDFDocument,
    data: any[],
    columns: string[],
    currency: string,
    margin: number,
    contentWidth: number,
  ): void {
    if (data.length === 0) return;

    // Calculate column widths - give more space to account name, less to numeric columns
    const numCols = columns.length;
    const accountNameWidth = contentWidth * 0.25; // 25% for account name
    const accountTypeWidth = contentWidth * 0.12; // 12% for account type
    const numericColWidth =
      (contentWidth - accountNameWidth - accountTypeWidth) / (numCols - 2); // Remaining space divided equally

    const colWidths: number[] = [];
    columns.forEach((col) => {
      if (col === 'accountName') {
        colWidths.push(accountNameWidth);
      } else if (col === 'accountType') {
        colWidths.push(accountTypeWidth);
      } else {
        colWidths.push(numericColWidth);
      }
    });

    // Header - Compact styling
    // Check if header fits on current page, add new page if needed
    const headerHeight = 20;
    const rowHeight = 16;
    if (doc.y + headerHeight + rowHeight > doc.page.height - 60) {
      doc.addPage();
      doc.y = 50;
    }
    const headerY = doc.y;
    doc
      .rect(margin, headerY, contentWidth, headerHeight)
      .fillColor('#0f172a')
      .fill()
      .strokeColor('#0f172a')
      .lineWidth(0.5)
      .stroke();

    doc.fontSize(7).font('Helvetica-Bold').fillColor('#ffffff');
    let x = margin + 3;
    columns.forEach((col, index) => {
      const label = this.formatHeaderLabel(col);
      doc.text(label, x, headerY + 6, {
        width: colWidths[index] - 6,
        align: this.getColumnAlignment(col),
        lineBreak: false,
        ellipsis: true,
      });
      x += colWidths[index];
    });

    // Rows - Compact with smaller fonts
    let rowY = headerY + headerHeight;
    data.forEach((row: any, index: number) => {
      // Check if we need a new page (check BEFORE adding the row to prevent overflow)
      if (rowY + rowHeight > doc.page.height - 60) {
        doc.addPage();
        rowY = 50;
        doc.y = rowY; // Sync doc.y with rowY position

        // Redraw header on new page
        doc
          .rect(margin, rowY, contentWidth, headerHeight)
          .fillColor('#0f172a')
          .fill()
          .strokeColor('#0f172a')
          .lineWidth(0.5)
          .stroke();

        doc.fontSize(7).font('Helvetica-Bold').fillColor('#ffffff');
        x = margin + 3;
        columns.forEach((col, colIndex) => {
          const label = this.formatHeaderLabel(col);
          doc.text(label, x, rowY + 6, {
            width: colWidths[colIndex] - 6,
            align: this.getColumnAlignment(col),
            lineBreak: false,
            ellipsis: true,
          });
          x += colWidths[colIndex];
        });
        rowY += headerHeight;
        doc.y = rowY; // Sync doc.y after header
      }

      // Row background (alternating)
      if (index % 2 === 0) {
        doc
          .rect(margin, rowY, contentWidth, rowHeight)
          .fillColor('#f8fafc')
          .fill();
      }

      // Row border
      doc.strokeColor('#e2e8f0').lineWidth(0.3);
      doc.rect(margin, rowY, contentWidth, rowHeight).stroke();

      // Row content - Very small font to prevent collisions
      doc.fillColor('#1a1a1a').fontSize(7).font('Helvetica');
      x = margin + 3;
      columns.forEach((col, colIndex) => {
        const value = this.formatCellValue(row[col], col, currency);
        doc.text(value, x, rowY + 4, {
          width: colWidths[colIndex] - 6,
          align: this.getColumnAlignment(col),
          lineBreak: false,
          ellipsis: true,
        });
        x += colWidths[colIndex];
      });
      rowY += rowHeight;
    });

    doc.y = rowY + 10;
  }

  private addXLSXHeader(
    worksheet: ExcelJS.Worksheet,
    reportData: ReportData,
  ): void {
    // Check if worksheet already has content (header already added)
    if (worksheet.rowCount > 0) {
      return; // Header already exists, skip
    }

    // Company header - Enhanced professional styling
    worksheet.addRow([
      reportData.metadata?.organizationName || 'SelfAccounting.AI',
    ]);
    // Check if cells are already merged before merging
    try {
      worksheet.mergeCells(`A1:D1`);
    } catch {
      // Cells already merged, skip silently
    }
    const headerCell = worksheet.getCell('A1');
    headerCell.font = {
      size: 18,
      bold: true,
      color: { argb: 'FFFFFFFF' }, // White text
    };
    headerCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0077C8' }, // Brand color
    };
    headerCell.alignment = { horizontal: 'left', vertical: 'middle' };
    headerCell.border = {
      top: { style: 'thin', color: { argb: 'FF005A9A' } },
      bottom: { style: 'thin', color: { argb: 'FF005A9A' } },
      left: { style: 'thin', color: { argb: 'FF005A9A' } },
      right: { style: 'thin', color: { argb: 'FF005A9A' } },
    };
    worksheet.getRow(1).height = 28;

    // Report title - Enhanced styling
    worksheet.addRow([this.getReportTitle(reportData.type)]);
    try {
      worksheet.mergeCells(`A2:D2`);
    } catch {
      // Cells already merged, skip silently
    }
    const titleCell = worksheet.getCell('A2');
    titleCell.font = {
      size: 16,
      bold: true,
      color: { argb: 'FF0077C8' }, // Brand color
    };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    worksheet.getRow(2).height = 24;

    // Period
    let rowNum = 3;
    if (
      reportData.metadata?.reportPeriod?.startDate ||
      reportData.metadata?.reportPeriod?.endDate
    ) {
      const period = `Period: ${this.formatDate(reportData.metadata.reportPeriod.startDate || '')} to ${this.formatDate(reportData.metadata.reportPeriod.endDate || '')}`;
      worksheet.addRow([period]);
      try {
        worksheet.mergeCells(`A${rowNum}:D${rowNum}`);
      } catch {
        // Cells already merged, skip silently
      }
      rowNum++;
    }

    // Organization details
    if (reportData.metadata?.vatNumber) {
      worksheet.addRow([`VAT Number: ${reportData.metadata.vatNumber}`]);
      try {
        worksheet.mergeCells(`A${rowNum}:D${rowNum}`);
      } catch {
        // Cells already merged, skip silently
      }
      rowNum++;
    }
    if (reportData.metadata?.address) {
      worksheet.addRow([`Address: ${reportData.metadata.address}`]);
      try {
        worksheet.mergeCells(`A${rowNum}:D${rowNum}`);
      } catch {
        // Cells already merged, skip silently
      }
      rowNum++;
    }

    // Generated date
    const generatedDate = reportData.metadata?.generatedAt
      ? this.formatDate(reportData.metadata.generatedAt)
      : new Date().toLocaleDateString('en-GB');
    worksheet.addRow([`Generated: ${generatedDate}`]);
    try {
      worksheet.mergeCells(`A${rowNum}:D${rowNum}`);
    } catch {
      // Cells already merged, skip silently
    }

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

      // Headers - Enhanced professional styling
      const headers = Object.keys(data[0]);
      const formattedHeaders = headers.map((h) => this.formatHeaderLabel(h));
      worksheet.addRow(formattedHeaders);
      const headerRow = worksheet.getRow(worksheet.rowCount);
      headerRow.font = {
        bold: true,
        size: 11,
        color: { argb: 'FFFFFFFF' }, // White text
      };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0077C8' }, // Brand color
      };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
      headerRow.border = {
        top: { style: 'medium', color: { argb: 'FF005A9A' } },
        bottom: { style: 'medium', color: { argb: 'FF005A9A' } },
        left: { style: 'thin', color: { argb: 'FF005A9A' } },
        right: { style: 'thin', color: { argb: 'FF005A9A' } },
      };
      headerRow.height = 22;

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

        // Alternate row colors - Enhanced styling
        if (index % 2 === 0) {
          dataRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8F9FA' }, // Light gray
          };
        } else {
          dataRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFFFF' }, // White
          };
        }
        dataRow.height = 20;

        // Format currency columns with enhanced borders
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
            cell.alignment = {
              horizontal: 'right',
              vertical: 'middle',
              wrapText: false,
            };
          } else if (header.toLowerCase().includes('date')) {
            cell.numFmt = 'dd-mmm-yyyy';
            cell.alignment = {
              horizontal: 'center',
              vertical: 'middle',
              wrapText: false,
            };
          } else {
            cell.alignment = {
              horizontal: 'left',
              vertical: 'middle',
              wrapText: true,
            };
          }
          // Enhanced borders with consistent styling
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          };
          cell.font = { size: 10, color: { argb: 'FF1F2937' } };
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
        totalDataRow.font = {
          bold: true,
          size: 11,
          color: { argb: 'FF0077C8' }, // Brand color
        };
        totalDataRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE8F4F8' }, // Light brand color tint
        };
        // Enhanced total row borders with double top border for emphasis
        totalDataRow.border = {
          top: { style: 'double', color: { argb: 'FF0077C8' } },
          bottom: { style: 'medium', color: { argb: 'FF0077C8' } },
          left: { style: 'thin', color: { argb: 'FF0077C8' } },
          right: { style: 'thin', color: { argb: 'FF0077C8' } },
        };
        totalDataRow.height = 26; // Increased height for emphasis

        // Apply borders to all cells in total row
        headers.forEach((header, colIndex) => {
          const cell = totalDataRow.getCell(colIndex + 1);
          cell.border = {
            top: { style: 'double', color: { argb: 'FF0077C8' } },
            bottom: { style: 'medium', color: { argb: 'FF0077C8' } },
            left: { style: 'thin', color: { argb: 'FF0077C8' } },
            right: { style: 'thin', color: { argb: 'FF0077C8' } },
          };
          cell.alignment = {
            horizontal: cell.alignment?.horizontal || 'left',
            vertical: 'middle',
          };
        });

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

      // Auto-fit columns with better width calculation
      worksheet.columns.forEach((column, index) => {
        if (column.header) {
          const headerLength = formattedHeaders[index]?.length || 10;
          // Calculate max content width for better fitting
          let maxContentLength = headerLength;
          data.forEach((row: any) => {
            const value = String(row[headers[index]] || '');
            if (value.length > maxContentLength) {
              maxContentLength = value.length;
            }
          });
          // Set width with padding, but cap at reasonable maximum
          column.width = Math.min(
            Math.max(maxContentLength + 4, headerLength + 2),
            50,
          );
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
      headerRow.font = {
        bold: true,
        size: 11,
        color: { argb: 'FFFFFFFF' },
      };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0077C8' },
      };
      headerRow.border = {
        top: { style: 'medium', color: { argb: 'FF005A9A' } },
        bottom: { style: 'medium', color: { argb: 'FF005A9A' } },
        left: { style: 'thin', color: { argb: 'FF005A9A' } },
        right: { style: 'thin', color: { argb: 'FF005A9A' } },
      };
      headerRow.height = 22;
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

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
      headerRow.font = {
        bold: true,
        size: 11,
        color: { argb: 'FFFFFFFF' },
      };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0077C8' },
      };
      headerRow.border = {
        top: { style: 'medium', color: { argb: 'FF005A9A' } },
        bottom: { style: 'medium', color: { argb: 'FF005A9A' } },
        left: { style: 'thin', color: { argb: 'FF005A9A' } },
        right: { style: 'thin', color: { argb: 'FF005A9A' } },
      };
      headerRow.height = 22;
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

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

    // Summary sheet - Remove existing worksheet if it exists to avoid merge conflicts
    const existingSheet = workbook.getWorksheet('Summary');
    if (existingSheet) {
      workbook.removeWorksheet(existingSheet.id);
    }
    const summarySheet = workbook.addWorksheet('Summary');
    this.addXLSXHeader(summarySheet, reportData);

    if (data.summary) {
      summarySheet.addRow(['Trial Balance Summary']);
      summarySheet.addRow([]);
      summarySheet.addRow(['Opening Balances']);
      summarySheet.addRow(['Opening Debit', data.summary.openingDebit || 0]);
      summarySheet.addRow(['Opening Credit', data.summary.openingCredit || 0]);
      summarySheet.addRow([
        'Opening Balance',
        data.summary.openingBalance || 0,
      ]);
      summarySheet.addRow([]);
      summarySheet.addRow(['Period Transactions']);
      summarySheet.addRow(['Period Debit', data.summary.periodDebit || 0]);
      summarySheet.addRow(['Period Credit', data.summary.periodCredit || 0]);
      summarySheet.addRow(['Period Balance', data.summary.periodBalance || 0]);
      summarySheet.addRow([]);
      summarySheet.addRow(['Closing Balances']);
      summarySheet.addRow(['Closing Debit', data.summary.closingDebit || 0]);
      summarySheet.addRow(['Closing Credit', data.summary.closingCredit || 0]);
      summarySheet.addRow([
        'Closing Balance',
        data.summary.closingBalance || 0,
      ]);
      summarySheet.addRow([]);
      summarySheet.addRow(['Total Summary']);
      summarySheet.addRow([
        'Total Debit',
        data.summary.closingDebit || data.summary.totalDebit || 0,
      ]);
      summarySheet.addRow([
        'Total Credit',
        data.summary.closingCredit || data.summary.totalCredit || 0,
      ]);
      summarySheet.addRow([
        'Total Balance',
        data.summary.closingBalance || data.summary.totalBalance || 0,
      ]);

      [3, 4, 5, 7, 8, 9, 11, 12, 13, 15, 16, 17].forEach((rowNum) => {
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

      // Add header row with formula column
      const headerRowValues = [
        'Account Name',
        'Account Type',
        'Opening Debit',
        'Opening Credit',
        'Opening Balance',
        'Period Debit',
        'Period Credit',
        'Period Balance',
        'Closing Debit',
        'Closing Credit',
        'Closing Balance',
      ];
      accountsSheet.addRow(headerRowValues);
      const headerRow = accountsSheet.getRow(1);
      headerRow.font = {
        bold: true,
        size: 11,
        color: { argb: 'FFFFFFFF' },
      };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0077C8' },
      };
      headerRow.border = {
        top: { style: 'medium', color: { argb: 'FF005A9A' } },
        bottom: { style: 'medium', color: { argb: 'FF005A9A' } },
        left: { style: 'thin', color: { argb: 'FF005A9A' } },
        right: { style: 'thin', color: { argb: 'FF005A9A' } },
      };
      headerRow.height = 22;
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      data.accounts.forEach((item: any, index: number) => {
        const rowNum = index + 2; // +2 because row 1 is header
        const isCreditAccount =
          item.accountType === 'Liability' ||
          item.accountType === 'Revenue' ||
          item.accountType === 'Equity';

        // For credit accounts, invert the sign for closing balance display
        const closingBalanceDisplay = isCreditAccount
          ? -(item.closingBalance || 0)
          : item.closingBalance || 0;

        accountsSheet.addRow([
          item.accountName,
          item.accountType,
          item.openingDebit || 0,
          item.openingCredit || 0,
          item.openingBalance || 0,
          item.debit || 0,
          item.credit || 0,
          item.balance || 0,
          item.closingDebit || 0,
          item.closingCredit || 0,
          closingBalanceDisplay, // Use inverted value for credit accounts
        ]);
      });

      // Format all currency columns
      ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].forEach((col) => {
        accountsSheet.getColumn(col).numFmt = `"${currency}" #,##0.00`;
        accountsSheet.getColumn(col).alignment = { horizontal: 'right' };
      });

      accountsSheet.getColumn('A').width = 25;
      accountsSheet.getColumn('B').width = 15;
      ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].forEach((col) => {
        accountsSheet.getColumn(col).width = 18;
      });

      // Add total row (optional)
      const totalRowNum = data.accounts.length + 2;
      accountsSheet.addRow([
        'Sum Total',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]);
      const totalRow = accountsSheet.getRow(totalRowNum);
      totalRow.font = { bold: true };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8EEF5' },
      };

      // Add sum formula for closing balance column (K)
      const closingBalanceSumCell = accountsSheet.getCell(`K${totalRowNum}`);
      closingBalanceSumCell.value = { formula: `SUM(K2:K${totalRowNum - 1})` };
      closingBalanceSumCell.numFmt = `"${currency}" #,##0.00`;
      closingBalanceSumCell.alignment = { horizontal: 'right' };
    }
  }

  private addXLSXGeneralLedger(
    workbook: ExcelJS.Workbook,
    reportData: ReportData,
    currency: string,
  ): void {
    const data = reportData.data;

    // Summary sheet
    const existingSheet = workbook.getWorksheet('Summary');
    if (existingSheet) {
      workbook.removeWorksheet(existingSheet.id);
    }
    const summarySheet = workbook.addWorksheet('Summary');
    this.addXLSXHeader(summarySheet, reportData);

    summarySheet.addRow(['General Ledger Report']);
    summarySheet.addRow([]);
    if (data.period) {
      summarySheet.addRow([
        'Period',
        `${data.period.startDate} to ${data.period.endDate}`,
      ]);
      summarySheet.addRow([]);
    }
    summarySheet.addRow(['Total Accounts', data.accounts?.length || 0]);

    // Create a sheet for each account
    if (data.accounts && Array.isArray(data.accounts)) {
      data.accounts.forEach((account: any) => {
        // Sanitize sheet name (Excel has limitations)
        let sheetName = account.accountName || account.accountCode || 'Account';
        sheetName = sheetName.substring(0, 31).replace(/[\\\/\?\*\[\]]/g, '_');

        // Check if sheet already exists (duplicate names)
        let accountSheet = workbook.getWorksheet(sheetName);
        if (!accountSheet) {
          accountSheet = workbook.addWorksheet(sheetName);
        }

        // Header
        accountSheet.addRow([account.accountName || account.accountCode]);
        accountSheet.addRow([`Category: ${account.accountCategory || 'N/A'}`]);
        accountSheet.addRow([
          `Opening Balance: ${this.formatCurrency(account.openingBalance || 0, currency)}`,
        ]);
        accountSheet.addRow([
          `Closing Balance: ${this.formatCurrency(account.closingBalance || 0, currency)}`,
        ]);
        accountSheet.addRow([]);

        // Transaction headers
        const headerRow = accountSheet.addRow([
          'Date',
          'Description',
          'Reference',
          'Source',
          'Debit',
          'Credit',
          'Balance',
        ]);
        headerRow.font = {
          bold: true,
          size: 11,
          color: { argb: 'FFFFFFFF' },
        };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0077C8' },
        };
        headerRow.border = {
          top: { style: 'medium', color: { argb: 'FF005A9A' } },
          bottom: { style: 'medium', color: { argb: 'FF005A9A' } },
          left: { style: 'thin', color: { argb: 'FF005A9A' } },
          right: { style: 'thin', color: { argb: 'FF005A9A' } },
        };
        headerRow.height = 22;
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

        // Add transactions
        if (account.transactions && Array.isArray(account.transactions)) {
          account.transactions.forEach((transaction: any) => {
            accountSheet.addRow([
              transaction.date,
              transaction.description || '',
              transaction.referenceNumber || '',
              transaction.source || '',
              transaction.debitAmount || 0,
              transaction.creditAmount || 0,
              transaction.runningBalance || 0,
            ]);
          });
        }

        // Format columns
        accountSheet.getColumn('A').width = 12; // Date
        accountSheet.getColumn('B').width = 30; // Description
        accountSheet.getColumn('C').width = 15; // Reference
        accountSheet.getColumn('D').width = 15; // Source
        accountSheet.getColumn('E').width = 15; // Debit
        accountSheet.getColumn('F').width = 15; // Credit
        accountSheet.getColumn('G').width = 15; // Balance

        // Format currency columns
        ['E', 'F', 'G'].forEach((col) => {
          accountSheet.getColumn(col).numFmt = `"${currency}" #,##0.00`;
          accountSheet.getColumn(col).alignment = { horizontal: 'right' };
        });

        // Format date column
        accountSheet.getColumn('A').alignment = { horizontal: 'left' };
      });
    }
  }

  private addXLSXBalanceSheet(
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
      summarySheet.addRow(['Balance Sheet Summary']);
      summarySheet.addRow([]);
      summarySheet.addRow(['Opening Balances']);
      summarySheet.addRow(['Opening Assets', data.summary.openingAssets || 0]);
      summarySheet.addRow([
        'Opening Liabilities',
        data.summary.openingLiabilities || 0,
      ]);
      summarySheet.addRow(['Opening Equity', data.summary.openingEquity || 0]);
      summarySheet.addRow([
        'Opening Balance',
        data.summary.openingBalance || 0,
      ]);
      summarySheet.addRow([]);
      summarySheet.addRow(['Period Transactions']);
      summarySheet.addRow([
        'Period Assets',
        data.summary.periodAssets || data.summary.totalAssets || 0,
      ]);
      summarySheet.addRow([
        'Period Liabilities',
        data.summary.periodLiabilities || data.summary.totalLiabilities || 0,
      ]);
      summarySheet.addRow([
        'Period Equity',
        data.summary.periodEquity || data.summary.totalEquity || 0,
      ]);
      summarySheet.addRow([]);
      summarySheet.addRow(['Closing Balances']);
      summarySheet.addRow(['Closing Assets', data.summary.closingAssets || 0]);
      summarySheet.addRow([
        'Closing Liabilities',
        data.summary.closingLiabilities || 0,
      ]);
      summarySheet.addRow(['Closing Equity', data.summary.closingEquity || 0]);
      summarySheet.addRow([
        'Closing Balance',
        data.summary.closingBalance || 0,
      ]);
      summarySheet.addRow([]);
      summarySheet.addRow(['Total Summary']);
      summarySheet.addRow([
        'Total Assets',
        data.summary.closingAssets || data.summary.totalAssets || 0,
      ]);
      summarySheet.addRow([
        'Total Liabilities',
        data.summary.closingLiabilities || data.summary.totalLiabilities || 0,
      ]);
      summarySheet.addRow([
        'Total Equity',
        data.summary.closingEquity || data.summary.totalEquity || 0,
      ]);

      [3, 4, 5, 6, 8, 9, 10, 12, 13, 14, 15].forEach((rowNum) => {
        const cell = summarySheet.getCell(`B${rowNum}`);
        cell.numFmt = `"${currency}" #,##0.00`;
      });
    }

    // Assets sheet
    if (
      data.assets &&
      data.assets.items &&
      Array.isArray(data.assets.items) &&
      data.assets.items.length > 0
    ) {
      const assetsSheet = workbook.addWorksheet('Assets');
      assetsSheet.addRow(['Category', 'Amount']);
      const headerRow = assetsSheet.getRow(1);
      headerRow.font = {
        bold: true,
        size: 11,
        color: { argb: 'FFFFFFFF' },
      };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0077C8' },
      };
      headerRow.border = {
        top: { style: 'medium', color: { argb: 'FF005A9A' } },
        bottom: { style: 'medium', color: { argb: 'FF005A9A' } },
        left: { style: 'thin', color: { argb: 'FF005A9A' } },
        right: { style: 'thin', color: { argb: 'FF005A9A' } },
      };
      headerRow.height = 22;
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      data.assets.items.forEach((item: any) => {
        assetsSheet.addRow([item.category || 'N/A', item.amount || 0]);
      });

      // Add total row
      assetsSheet.addRow(['Total Assets', data.assets.total || 0]);
      const totalRow = assetsSheet.getRow(assetsSheet.rowCount);
      totalRow.font = { bold: true };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8EEF5' },
      };

      assetsSheet.getColumn('B').numFmt = `"${currency}" #,##0.00`;
      assetsSheet.getColumn('B').alignment = { horizontal: 'right' };
      assetsSheet.getColumn('A').width = 25;
      assetsSheet.getColumn('B').width = 18;
    }

    // Liabilities sheet
    if (
      data.liabilities &&
      data.liabilities.items &&
      Array.isArray(data.liabilities.items) &&
      data.liabilities.items.length > 0
    ) {
      const liabilitiesSheet = workbook.addWorksheet('Liabilities');
      liabilitiesSheet.addRow(['Vendor', 'Amount', 'Status']);
      const headerRow = liabilitiesSheet.getRow(1);
      headerRow.font = {
        bold: true,
        size: 11,
        color: { argb: 'FFFFFFFF' },
      };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0077C8' },
      };
      headerRow.border = {
        top: { style: 'medium', color: { argb: 'FF005A9A' } },
        bottom: { style: 'medium', color: { argb: 'FF005A9A' } },
        left: { style: 'thin', color: { argb: 'FF005A9A' } },
        right: { style: 'thin', color: { argb: 'FF005A9A' } },
      };
      headerRow.height = 22;
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      data.liabilities.items.forEach((item: any) => {
        liabilitiesSheet.addRow([
          item.vendor || 'N/A',
          item.amount || 0,
          item.status || 'N/A',
        ]);
      });

      // Add total row
      liabilitiesSheet.addRow([
        'Total Liabilities',
        data.liabilities.total || 0,
        '',
      ]);
      const totalRow = liabilitiesSheet.getRow(liabilitiesSheet.rowCount);
      totalRow.font = { bold: true };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8EEF5' },
      };

      liabilitiesSheet.getColumn('B').numFmt = `"${currency}" #,##0.00`;
      liabilitiesSheet.getColumn('B').alignment = { horizontal: 'right' };
      liabilitiesSheet.getColumn('A').width = 25;
      liabilitiesSheet.getColumn('B').width = 18;
      liabilitiesSheet.getColumn('C').width = 15;
    }
  }

  private addXLSXProfitAndLoss(
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
      summarySheet.addRow(['Profit and Loss Summary']);
      summarySheet.addRow([]);
      summarySheet.addRow([
        'Opening Retained Earnings',
        data.summary.openingRetainedEarnings || 0,
      ]);
      summarySheet.addRow([]);
      summarySheet.addRow(['Period Transactions']);
      summarySheet.addRow(['Revenue', data.summary.grossProfit || 0]);
      summarySheet.addRow(['Total Expenses', data.summary.totalExpenses || 0]);
      summarySheet.addRow(['Net Profit', data.summary.netProfit || 0]);
      if (data.summary.netProfitMargin) {
        summarySheet.addRow([
          'Profit Margin (%)',
          data.summary.netProfitMargin,
        ]);
      }
      summarySheet.addRow([]);
      summarySheet.addRow([
        'Closing Retained Earnings',
        data.summary.closingRetainedEarnings || 0,
      ]);

      [3, 6, 7, 8, 11].forEach((rowNum) => {
        const cell = summarySheet.getCell(`B${rowNum}`);
        cell.numFmt = `"${currency}" #,##0.00`;
      });
      if (data.summary.netProfitMargin) {
        const marginCell = summarySheet.getCell(`B9`);
        marginCell.numFmt = '0.00"%"';
      }
    }

    // Revenue sheet
    if (data.revenue) {
      const revenueSheet = workbook.addWorksheet('Revenue');
      revenueSheet.addRow(['Description', 'Amount']);
      const headerRow = revenueSheet.getRow(1);
      headerRow.font = {
        bold: true,
        size: 11,
        color: { argb: 'FFFFFFFF' },
      };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0077C8' },
      };
      headerRow.border = {
        top: { style: 'medium', color: { argb: 'FF005A9A' } },
        bottom: { style: 'medium', color: { argb: 'FF005A9A' } },
        left: { style: 'thin', color: { argb: 'FF005A9A' } },
        right: { style: 'thin', color: { argb: 'FF005A9A' } },
      };
      headerRow.height = 22;
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      revenueSheet.addRow([
        'Total Revenue',
        data.revenue.netAmount || data.revenue.amount || 0,
      ]);

      ['B'].forEach((col) => {
        revenueSheet.getColumn(col).numFmt = `"${currency}" #,##0.00`;
        revenueSheet.getColumn(col).alignment = { horizontal: 'right' };
      });
      revenueSheet.getColumn('A').width = 25;
      ['B'].forEach((col) => {
        revenueSheet.getColumn(col).width = 18;
      });
    }

    // Expenses sheet
    if (
      data.expenses &&
      data.expenses.items &&
      Array.isArray(data.expenses.items) &&
      data.expenses.items.length > 0
    ) {
      const expensesSheet = workbook.addWorksheet('Expenses');
      expensesSheet.addRow(['Category', 'Amount']);
      const headerRow = expensesSheet.getRow(1);
      headerRow.font = {
        bold: true,
        size: 11,
        color: { argb: 'FFFFFFFF' },
      };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0077C8' },
      };
      headerRow.border = {
        top: { style: 'medium', color: { argb: 'FF005A9A' } },
        bottom: { style: 'medium', color: { argb: 'FF005A9A' } },
        left: { style: 'thin', color: { argb: 'FF005A9A' } },
        right: { style: 'thin', color: { argb: 'FF005A9A' } },
      };
      headerRow.height = 22;
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      data.expenses.items.forEach((item: any) => {
        expensesSheet.addRow([item.category || 'N/A', item.amount || 0]);
      });

      // Add total row
      expensesSheet.addRow(['Total Expenses', data.expenses.total || 0]);
      const totalRow = expensesSheet.getRow(expensesSheet.rowCount);
      totalRow.font = { bold: true };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8EEF5' },
      };

      ['B'].forEach((col) => {
        expensesSheet.getColumn(col).numFmt = `"${currency}" #,##0.00`;
        expensesSheet.getColumn(col).alignment = { horizontal: 'right' };
      });
      expensesSheet.getColumn('A').width = 25;
      ['B'].forEach((col) => {
        expensesSheet.getColumn(col).width = 18;
      });
    }
  }

  private addXLSXPayables(
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
      summarySheet.addRow(['Payables Summary']);
      summarySheet.addRow([]);
      summarySheet.addRow([
        'Opening Balance',
        data.summary?.openingBalance || 0,
      ]);
      summarySheet.addRow(['Period Amount', data.summary?.periodAmount || 0]);
      summarySheet.addRow([
        'Closing Balance',
        data.summary?.closingBalance || 0,
      ]);
      summarySheet.addRow([]);
      summarySheet.addRow(['Total Outstanding', data.summary.totalAmount || 0]);
      summarySheet.addRow(['Total Items', data.summary.totalItems || 0]);
      summarySheet.addRow(['Overdue Items', data.summary.overdueItems || 0]);
      summarySheet.addRow(['Overdue Amount', data.summary.overdueAmount || 0]);
      summarySheet.addRow([
        'Total Suppliers',
        data.summary.totalSuppliers || 0,
      ]);

      [3, 4, 5, 7, 9].forEach((rowNum) => {
        const cell = summarySheet.getCell(`B${rowNum}`);
        cell.numFmt = `"${currency}" #,##0.00`;
      });
    }

    // Supplier Summary Sheet
    if (
      data.supplierSummary &&
      Array.isArray(data.supplierSummary) &&
      data.supplierSummary.length > 0
    ) {
      const supplierSheet = workbook.addWorksheet('Supplier Summary');
      supplierSheet.addRow([
        'Supplier',
        'Pending Balance',
        'Item Count',
        'Overdue Amount',
        'Overdue Count',
      ]);
      const supplierHeaderRow = supplierSheet.getRow(1);
      supplierHeaderRow.font = {
        bold: true,
        size: 11,
        color: { argb: 'FFFFFFFF' },
      };
      supplierHeaderRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0077C8' },
      };
      supplierHeaderRow.border = {
        top: { style: 'medium', color: { argb: 'FF005A9A' } },
        bottom: { style: 'medium', color: { argb: 'FF005A9A' } },
        left: { style: 'thin', color: { argb: 'FF005A9A' } },
        right: { style: 'thin', color: { argb: 'FF005A9A' } },
      };
      supplierHeaderRow.height = 22;
      supplierHeaderRow.alignment = {
        horizontal: 'center',
        vertical: 'middle',
      };

      data.supplierSummary.forEach((supplier: any) => {
        supplierSheet.addRow([
          supplier.vendor || 'N/A',
          supplier.pendingBalance || 0,
          supplier.itemCount || 0,
          supplier.overdueAmount || 0,
          supplier.overdueCount || 0,
        ]);
      });

      // Add total row
      const totalPendingBalance = data.supplierSummary.reduce(
        (sum: number, s: any) => sum + (s.pendingBalance || 0),
        0,
      );
      const totalOverdueAmount = data.supplierSummary.reduce(
        (sum: number, s: any) => sum + (s.overdueAmount || 0),
        0,
      );
      supplierSheet.addRow([
        'Total',
        totalPendingBalance,
        data.summary?.totalItems || 0,
        totalOverdueAmount,
        data.summary?.overdueItems || 0,
      ]);
      const totalRow = supplierSheet.getRow(supplierSheet.rowCount);
      totalRow.font = { bold: true };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8EEF5' },
      };

      supplierSheet.getColumn('B').numFmt = `"${currency}" #,##0.00`;
      supplierSheet.getColumn('B').alignment = { horizontal: 'right' };
      supplierSheet.getColumn('D').numFmt = `"${currency}" #,##0.00`;
      supplierSheet.getColumn('D').alignment = { horizontal: 'right' };
      supplierSheet.getColumn('C').alignment = { horizontal: 'center' };
      supplierSheet.getColumn('E').alignment = { horizontal: 'center' };
    }

    // Items sheet
    if (data.items && Array.isArray(data.items) && data.items.length > 0) {
      const itemsSheet = workbook.addWorksheet('Payables');
      itemsSheet.addRow([
        'Vendor',
        'Invoice Number',
        'Invoice Date',
        'Amount',
        'Status',
        'Due Date',
      ]);
      const headerRow = itemsSheet.getRow(1);
      headerRow.font = {
        bold: true,
        size: 11,
        color: { argb: 'FFFFFFFF' },
      };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0077C8' },
      };
      headerRow.border = {
        top: { style: 'medium', color: { argb: 'FF005A9A' } },
        bottom: { style: 'medium', color: { argb: 'FF005A9A' } },
        left: { style: 'thin', color: { argb: 'FF005A9A' } },
        right: { style: 'thin', color: { argb: 'FF005A9A' } },
      };
      headerRow.height = 22;
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      data.items.forEach((item: any) => {
        itemsSheet.addRow([
          item.vendor || 'N/A',
          item.invoiceNumber || 'N/A',
          item.invoiceDate || '',
          item.amount || 0,
          item.status || 'N/A',
          item.dueDate || '',
        ]);
      });

      // Add total row
      itemsSheet.addRow([
        'Total',
        '',
        '',
        data.summary?.totalOutstanding || 0,
        '',
        '',
      ]);
      const totalRow = itemsSheet.getRow(itemsSheet.rowCount);
      totalRow.font = { bold: true };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8EEF5' },
      };

      itemsSheet.getColumn('D').numFmt = `"${currency}" #,##0.00`;
      itemsSheet.getColumn('D').alignment = { horizontal: 'right' };
      itemsSheet.getColumn('C').numFmt = 'dd-mmm-yyyy';
      itemsSheet.getColumn('C').alignment = { horizontal: 'center' };
      itemsSheet.getColumn('F').numFmt = 'dd-mmm-yyyy';
      itemsSheet.getColumn('F').alignment = { horizontal: 'center' };
      itemsSheet.getColumn('A').width = 25;
      itemsSheet.getColumn('B').width = 18;
      itemsSheet.getColumn('C').width = 15;
      itemsSheet.getColumn('D').width = 18;
      itemsSheet.getColumn('E').width = 15;
      itemsSheet.getColumn('F').width = 15;
    }
  }

  private addXLSXVatControlAccount(
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
      summarySheet.addRow(['VAT Control Account Summary']);
      summarySheet.addRow(['VAT Input', data.summary.vatInput || 0]);
      summarySheet.addRow(['VAT Output', data.summary.vatOutput || 0]);
      summarySheet.addRow(['Net VAT', data.summary.netVat || 0]);
      summarySheet.addRow([
        'Total Transactions',
        data.summary.totalTransactions || 0,
      ]);
      summarySheet.addRow([
        'Input Transactions',
        data.summary.inputTransactions || 0,
      ]);
      summarySheet.addRow([
        'Output Transactions',
        data.summary.outputTransactions || 0,
      ]);

      if (data.startDate || data.endDate) {
        summarySheet.addRow(['']);
        summarySheet.addRow([
          'Report Period',
          `${data.startDate || 'N/A'} to ${data.endDate || 'N/A'}`,
        ]);
      }

      // Format currency cells
      ['B2', 'B3', 'B4'].forEach((cellRef) => {
        const cell = summarySheet.getCell(cellRef);
        cell.numFmt = `"${currency}" #,##0.00`;
        cell.font = { bold: true };
      });

      // Net VAT cell with conditional formatting
      const netVatCell = summarySheet.getCell('B4');
      netVatCell.font = { bold: true, size: 12 };
      if ((data.summary.netVat || 0) >= 0) {
        netVatCell.font = { ...netVatCell.font, color: { argb: 'FF059669' } }; // Green
      } else {
        netVatCell.font = { ...netVatCell.font, color: { argb: 'FFDC2626' } }; // Red
      }
    }

    // VAT Input sheet
    if (
      data.vatInputItems &&
      Array.isArray(data.vatInputItems) &&
      data.vatInputItems.length > 0
    ) {
      const inputSheet = workbook.addWorksheet('VAT Input');
      inputSheet.addRow([
        'Date',
        'Description',
        'Vendor',
        'Amount',
        'VAT Rate (%)',
        'VAT Amount',
        'TRN',
      ]);

      const headerRow = inputSheet.getRow(1);
      headerRow.font = {
        bold: true,
        size: 11,
        color: { argb: 'FFFFFFFF' },
      };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDC2626' }, // Red for input
      };
      headerRow.border = {
        top: { style: 'medium', color: { argb: 'FFB91C1C' } },
        bottom: { style: 'medium', color: { argb: 'FFB91C1C' } },
        left: { style: 'thin', color: { argb: 'FFB91C1C' } },
        right: { style: 'thin', color: { argb: 'FFB91C1C' } },
      };
      headerRow.height = 22;
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      data.vatInputItems.forEach((item: any) => {
        inputSheet.addRow([
          item.date || '',
          item.description || item.vendorName || 'N/A',
          item.vendorName || 'N/A',
          item.amount || 0,
          item.vatRate || 0,
          item.vatAmount || 0,
          item.trn || 'N/A',
        ]);
      });

      // Add total row
      const totalInput = data.vatInputItems.reduce(
        (sum: number, item: any) => sum + (item.vatAmount || 0),
        0,
      );
      const totalInputAmount = data.vatInputItems.reduce(
        (sum: number, item: any) => sum + (item.amount || 0),
        0,
      );
      inputSheet.addRow([
        'Total',
        '',
        '',
        totalInputAmount,
        '',
        totalInput,
        '',
      ]);
      const totalRow = inputSheet.getRow(inputSheet.rowCount);
      totalRow.font = { bold: true };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE5E5' },
      };

      // Format columns
      inputSheet.getColumn('A').numFmt = 'dd-mmm-yyyy';
      inputSheet.getColumn('A').alignment = { horizontal: 'center' };
      inputSheet.getColumn('D').numFmt = `"${currency}" #,##0.00`;
      inputSheet.getColumn('D').alignment = { horizontal: 'right' };
      inputSheet.getColumn('E').numFmt = '0.00"%"';
      inputSheet.getColumn('E').alignment = { horizontal: 'right' };
      inputSheet.getColumn('F').numFmt = `"${currency}" #,##0.00`;
      inputSheet.getColumn('F').alignment = { horizontal: 'right' };
      inputSheet.getColumn('B').width = 30;
      inputSheet.getColumn('C').width = 25;
      inputSheet.getColumn('D').width = 18;
      inputSheet.getColumn('E').width = 12;
      inputSheet.getColumn('F').width = 18;
      inputSheet.getColumn('G').width = 15;
    }

    // VAT Output sheet
    if (
      data.vatOutputItems &&
      Array.isArray(data.vatOutputItems) &&
      data.vatOutputItems.length > 0
    ) {
      const outputSheet = workbook.addWorksheet('VAT Output');
      outputSheet.addRow([
        'Date',
        'Description',
        'Invoice Number',
        'Customer',
        'Amount',
        'VAT Rate (%)',
        'VAT Amount',
        'TRN',
      ]);

      const headerRow = outputSheet.getRow(1);
      headerRow.font = {
        bold: true,
        size: 11,
        color: { argb: 'FFFFFFFF' },
      };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF059669' }, // Green for output
      };
      headerRow.border = {
        top: { style: 'medium', color: { argb: 'FF047857' } },
        bottom: { style: 'medium', color: { argb: 'FF047857' } },
        left: { style: 'thin', color: { argb: 'FF047857' } },
        right: { style: 'thin', color: { argb: 'FF047857' } },
      };
      headerRow.height = 22;
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      data.vatOutputItems.forEach((item: any) => {
        outputSheet.addRow([
          item.date || '',
          item.description || item.invoiceNumber || item.customerName || 'N/A',
          item.invoiceNumber || 'N/A',
          item.customerName || 'N/A',
          item.amount || 0,
          item.vatRate || 0,
          item.vatAmount || 0,
          item.trn || 'N/A',
        ]);
      });

      // Add total row
      const totalOutput = data.vatOutputItems.reduce(
        (sum: number, item: any) => sum + (item.vatAmount || 0),
        0,
      );
      const totalOutputAmount = data.vatOutputItems.reduce(
        (sum: number, item: any) => sum + (item.amount || 0),
        0,
      );
      outputSheet.addRow([
        'Total',
        '',
        '',
        '',
        totalOutputAmount,
        '',
        totalOutput,
        '',
      ]);
      const totalRow = outputSheet.getRow(outputSheet.rowCount);
      totalRow.font = { bold: true };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5F5F0' },
      };

      // Format columns
      outputSheet.getColumn('A').numFmt = 'dd-mmm-yyyy';
      outputSheet.getColumn('A').alignment = { horizontal: 'center' };
      outputSheet.getColumn('E').numFmt = `"${currency}" #,##0.00`;
      outputSheet.getColumn('E').alignment = { horizontal: 'right' };
      outputSheet.getColumn('F').numFmt = '0.00"%"';
      outputSheet.getColumn('F').alignment = { horizontal: 'right' };
      outputSheet.getColumn('G').numFmt = `"${currency}" #,##0.00`;
      outputSheet.getColumn('G').alignment = { horizontal: 'right' };
      outputSheet.getColumn('B').width = 30;
      outputSheet.getColumn('C').width = 18;
      outputSheet.getColumn('D').width = 25;
      outputSheet.getColumn('E').width = 18;
      outputSheet.getColumn('F').width = 12;
      outputSheet.getColumn('G').width = 18;
      outputSheet.getColumn('H').width = 15;
    }
  }

  /**
   * Excel Stock Balance Report
   */
  private addXLSXStockBalance(
    workbook: ExcelJS.Workbook,
    reportData: ReportData,
    currency: string,
  ): void {
    const data = reportData.data as any;

    // Summary sheet
    const summarySheet =
      workbook.getWorksheet('Summary') || workbook.addWorksheet('Summary');
    this.addXLSXHeader(summarySheet, reportData);

    summarySheet.addRow(['Stock Balance Report Summary']);
    const titleRow = summarySheet.getRow(summarySheet.rowCount);
    titleRow.font = { bold: true, size: 14 };
    summarySheet.addRow([]);

    // Period
    if (data.period) {
      if (data.period.startDate) {
        summarySheet.addRow([
          'From:',
          new Date(data.period.startDate).toLocaleDateString('en-GB'),
        ]);
      }
      if (data.period.endDate) {
        summarySheet.addRow([
          'To:',
          new Date(data.period.endDate).toLocaleDateString('en-GB'),
        ]);
      }
      summarySheet.addRow([]);
    }

    // Summary cards
    const summary = data.summary || {};
    summarySheet.addRow(['Summary']);
    const summaryTitleRow = summarySheet.getRow(summarySheet.rowCount);
    summaryTitleRow.font = { bold: true, size: 12 };
    summarySheet.addRow([]);

    summarySheet.addRow(['Opening Stock', summary.totalOpeningStock || 0]);
    summarySheet.addRow(['Stock Inwards', summary.totalStockInwards || 0]);
    summarySheet.addRow(['Stock Outwards', summary.totalStockOutwards || 0]);
    summarySheet.addRow(['Adjustments', summary.totalAdjustments || 0]);
    summarySheet.addRow(['Closing Stock', summary.totalClosingStock || 0]);
    summarySheet.addRow(['Stock Value', summary.totalStockValue || 0]);
    const stockValueRow = summarySheet.getRow(summarySheet.rowCount);
    stockValueRow.font = { bold: true };

    // Format summary
    summarySheet.getColumn('A').width = 20;
    summarySheet.getColumn('B').numFmt = '#,##0.00';
    summarySheet.getColumn('B').alignment = { horizontal: 'right' };
    summarySheet.getRow(summarySheet.rowCount).getCell('B').numFmt =
      `"${currency}" #,##0.00`;

    summarySheet.addRow([]);
    summarySheet.addRow([
      'Note: Total stock value should match the "Closing Stock (Inventory)" amount in the Balance Sheet report for the same date.',
    ]);
    const noteRow = summarySheet.getRow(summarySheet.rowCount);
    noteRow.font = { italic: true, size: 9 };
    noteRow.getCell('A').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F7FC' },
    };

    // Products sheet
    if (
      data.products &&
      Array.isArray(data.products) &&
      data.products.length > 0
    ) {
      const productsSheet = workbook.addWorksheet('Products');
      productsSheet.addRow([
        'Product Name',
        'SKU',
        'Unit',
        'Opening Stock',
        'Stock Inwards',
        'Stock Outwards',
        'Adjustments',
        'Closing Stock',
        'Avg Cost/Unit',
        'Stock Value',
      ]);

      const headerRow = productsSheet.getRow(1);
      headerRow.font = {
        bold: true,
        size: 11,
        color: { argb: 'FFFFFFFF' },
      };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0077C8' },
      };
      headerRow.border = {
        top: { style: 'medium', color: { argb: 'FF005A9A' } },
        bottom: { style: 'medium', color: { argb: 'FF005A9A' } },
        left: { style: 'thin', color: { argb: 'FF005A9A' } },
        right: { style: 'thin', color: { argb: 'FF005A9A' } },
      };
      headerRow.height = 22;
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      data.products.forEach((product: any) => {
        productsSheet.addRow([
          product.productName || 'N/A',
          product.sku || 'N/A',
          product.unitOfMeasure || 'unit',
          product.openingStock || 0,
          product.stockInwards || 0,
          product.stockOutwards || 0,
          product.adjustments || 0,
          product.closingStock || 0,
          product.averageCost || 0,
          product.stockValue || 0,
        ]);
      });

      // Total row
      productsSheet.addRow([
        'TOTAL',
        '',
        '',
        summary.totalOpeningStock || 0,
        summary.totalStockInwards || 0,
        summary.totalStockOutwards || 0,
        summary.totalAdjustments || 0,
        summary.totalClosingStock || 0,
        '',
        summary.totalStockValue || 0,
      ]);
      const totalRow = productsSheet.getRow(productsSheet.rowCount);
      totalRow.font = { bold: true };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF0F7FC' },
      };

      // Format columns
      productsSheet.getColumn('A').width = 30;
      productsSheet.getColumn('B').width = 15;
      productsSheet.getColumn('C').width = 10;
      productsSheet.getColumn('D').numFmt = '#,##0.00';
      productsSheet.getColumn('D').alignment = { horizontal: 'right' };
      productsSheet.getColumn('E').numFmt = '#,##0.00';
      productsSheet.getColumn('E').alignment = { horizontal: 'right' };
      productsSheet.getColumn('F').numFmt = '#,##0.00';
      productsSheet.getColumn('F').alignment = { horizontal: 'right' };
      productsSheet.getColumn('G').numFmt = '#,##0.00';
      productsSheet.getColumn('G').alignment = { horizontal: 'right' };
      productsSheet.getColumn('H').numFmt = '#,##0.00';
      productsSheet.getColumn('H').alignment = { horizontal: 'right' };
      productsSheet.getColumn('I').numFmt = `"${currency}" #,##0.00`;
      productsSheet.getColumn('I').alignment = { horizontal: 'right' };
      productsSheet.getColumn('J').numFmt = `"${currency}" #,##0.00`;
      productsSheet.getColumn('J').alignment = { horizontal: 'right' };
      totalRow.getCell('J').font = { bold: true };
    }
  }

  private addXLSXReceivables(
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
      summarySheet.addRow(['Receivables Summary']);
      summarySheet.addRow([]);
      summarySheet.addRow([
        'Opening Balance',
        data.summary?.openingBalance || 0,
      ]);
      summarySheet.addRow([
        'Period Outstanding',
        data.summary?.periodAmount || data.summary?.periodOutstanding || 0,
      ]);
      summarySheet.addRow([
        'Closing Balance',
        data.summary?.closingBalance || 0,
      ]);
      summarySheet.addRow([]);
      summarySheet.addRow([
        'Total Outstanding',
        data.summary.totalOutstanding || 0,
      ]);
      summarySheet.addRow(['Total Items', data.summary.totalItems || 0]);
      summarySheet.addRow(['Overdue Items', data.summary.overdueInvoices || 0]);
      summarySheet.addRow(['Overdue Amount', data.summary.overdueAmount || 0]);

      [3, 4, 5, 7, 8, 9].forEach((rowNum) => {
        const cell = summarySheet.getCell(`B${rowNum}`);
        cell.numFmt = `"${currency}" #,##0.00`;
      });
    }

    // Items sheet
    if (data.items && Array.isArray(data.items) && data.items.length > 0) {
      const itemsSheet = workbook.addWorksheet('Receivables');
      itemsSheet.addRow([
        'Customer',
        'Invoice Number',
        'Invoice Date',
        'Amount',
        'Outstanding',
        'Status',
        'Due Date',
      ]);
      const headerRow = itemsSheet.getRow(1);
      headerRow.font = {
        bold: true,
        size: 11,
        color: { argb: 'FFFFFFFF' },
      };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0077C8' },
      };
      headerRow.border = {
        top: { style: 'medium', color: { argb: 'FF005A9A' } },
        bottom: { style: 'medium', color: { argb: 'FF005A9A' } },
        left: { style: 'thin', color: { argb: 'FF005A9A' } },
        right: { style: 'thin', color: { argb: 'FF005A9A' } },
      };
      headerRow.height = 22;
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      data.items.forEach((item: any) => {
        itemsSheet.addRow([
          item.customer || 'N/A',
          item.invoiceNumber || 'N/A',
          item.invoiceDate || '',
          item.amount || 0,
          item.outstanding || 0,
          item.status || 'N/A',
          item.dueDate || '',
        ]);
      });

      // Add total row
      itemsSheet.addRow([
        'Total',
        '',
        '',
        data.summary?.totalAmount || 0,
        data.summary?.totalOutstanding || 0,
        '',
        '',
      ]);
      const totalRow = itemsSheet.getRow(itemsSheet.rowCount);
      totalRow.font = { bold: true };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8EEF5' },
      };

      ['D', 'E'].forEach((col) => {
        itemsSheet.getColumn(col).numFmt = `"${currency}" #,##0.00`;
        itemsSheet.getColumn(col).alignment = { horizontal: 'right' };
      });
      itemsSheet.getColumn('C').numFmt = 'dd-mmm-yyyy';
      itemsSheet.getColumn('C').alignment = { horizontal: 'center' };
      itemsSheet.getColumn('G').numFmt = 'dd-mmm-yyyy';
      itemsSheet.getColumn('G').alignment = { horizontal: 'center' };
      itemsSheet.getColumn('A').width = 25;
      itemsSheet.getColumn('B').width = 18;
      itemsSheet.getColumn('C').width = 15;
      itemsSheet.getColumn('D').width = 18;
      itemsSheet.getColumn('E').width = 18;
      itemsSheet.getColumn('F').width = 15;
      itemsSheet.getColumn('G').width = 15;
    }
  }

  private addCSVContent(lines: string[], reportData: ReportData): void {
    const data = reportData.data;
    const currency = reportData.metadata?.currency || 'AED';

    if (Array.isArray(data)) {
      if (data.length === 0) {
        lines.push('No data available.');
        return;
      }

      // Section header
      lines.push('DATA');
      lines.push('-'.repeat(80));

      // Headers with formatted labels
      const headers = Object.keys(data[0]);
      const formattedHeaders = headers.map((h) => this.formatHeaderLabel(h));
      lines.push(formattedHeaders.join(','));

      // Data rows with proper formatting
      data.forEach((row: any, index: number) => {
        const values = headers.map((h) => {
          let value = row[h];

          // Format currency values with proper formatting
          const currencyFields = [
            'amount',
            'vat',
            'total',
            'totalAmount',
            'vatAmount',
            'baseAmount',
            'debit',
            'credit',
            'balance',
            'openingDebit',
            'openingCredit',
            'openingBalance',
            'periodDebit',
            'periodCredit',
            'periodBalance',
            'closingDebit',
            'closingCredit',
            'closingBalance',
            'paidAmount',
            'outstanding',
            'outstandingAmount',
            'openingAssets',
            'openingLiabilities',
            'openingEquity',
            'periodAssets',
            'periodLiabilities',
            'periodEquity',
            'closingAssets',
            'closingLiabilities',
            'closingEquity',
            'grossProfit',
            'totalExpenses',
            'netProfit',
            'openingRetainedEarnings',
            'closingRetainedEarnings',
            'periodAmount',
            'overdueAmount',
            'totalOutstanding',
            'totalDebit',
            'totalCredit',
            'totalBalance',
          ];
          if (currencyFields.some((field) => h.toLowerCase().includes(field))) {
            const numValue =
              typeof value === 'string' ? parseFloat(value) : value;
            if (!isNaN(numValue)) {
              // Format with currency symbol and proper decimal places
              value = this.formatCurrency(numValue, currency);
            } else {
              value = this.formatCurrency(0, currency);
            }
          }
          // Format dates
          else if (h.toLowerCase().includes('date') && value) {
            value = this.formatDate(value);
          }
          // Format arrays
          else if (Array.isArray(value)) {
            value = value.length > 0 ? `${value.length} item(s)` : 'None';
          }
          // Format objects
          else if (typeof value === 'object' && value !== null) {
            value = JSON.stringify(value);
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

      // Add totals row if applicable
      if (this.shouldShowTotal(reportData.type) && data.length > 0) {
        lines.push('');
        lines.push('TOTALS');
        lines.push('-'.repeat(80));
        const totalRow = this.calculateTotalRow(data, headers, currency);
        const totalValues = headers.map((h) => {
          const currencyFields = [
            'amount',
            'vat',
            'total',
            'totalAmount',
            'vatAmount',
            'baseAmount',
            'debit',
            'credit',
            'balance',
            'openingDebit',
            'openingCredit',
            'openingBalance',
            'periodDebit',
            'periodCredit',
            'periodBalance',
            'closingDebit',
            'closingCredit',
            'closingBalance',
            'paidAmount',
            'outstanding',
            'outstandingAmount',
          ];
          if (currencyFields.some((field) => h.toLowerCase().includes(field))) {
            const val = totalRow[h];
            if (val && typeof val === 'string') {
              return val; // Already formatted
            }
            return this.formatCurrency(parseFloat(String(val || 0)), currency);
          }
          return totalRow[h] || '';
        });
        lines.push(totalValues.join(','));
      }
    } else if (typeof data === 'object' && data !== null) {
      // Handle structured reports
      if (reportData.type === 'vat_control_account') {
        // VAT Control Account CSV format
        const data = reportData.data;
        const currency = reportData.metadata?.currency || 'AED';

        lines.push('VAT Control Account Report');
        lines.push('');
        if (data.startDate || data.endDate) {
          lines.push(
            `Report Period,${data.startDate || 'N/A'} to ${data.endDate || 'N/A'}`,
          );
        }
        lines.push('');
        lines.push('Summary');
        lines.push('-'.repeat(80));
        if (data.summary) {
          lines.push(
            `VAT Input,${this.formatCurrency(data.summary.vatInput || 0, currency)}`,
          );
          lines.push(
            `VAT Output,${this.formatCurrency(data.summary.vatOutput || 0, currency)}`,
          );
          lines.push(
            `Net VAT,${this.formatCurrency(data.summary.netVat || 0, currency)}`,
          );
          lines.push(
            `Total Transactions,${data.summary.totalTransactions || 0}`,
          );
          lines.push(
            `Input Transactions,${data.summary.inputTransactions || 0}`,
          );
          lines.push(
            `Output Transactions,${data.summary.outputTransactions || 0}`,
          );
        }
        lines.push('');
        lines.push('-'.repeat(80));
        lines.push('');

        // VAT Input Items
        if (
          data.vatInputItems &&
          Array.isArray(data.vatInputItems) &&
          data.vatInputItems.length > 0
        ) {
          lines.push('VAT Input (Purchases/Expenses)');
          lines.push('-'.repeat(80));
          lines.push(
            'Date,Description,Vendor,Amount,VAT Rate (%),VAT Amount,TRN',
          );
          data.vatInputItems.forEach((item: any) => {
            const date = item.date
              ? new Date(item.date).toLocaleDateString('en-GB')
              : 'N/A';
            lines.push(
              [
                date,
                item.description || item.vendorName || 'N/A',
                item.vendorName || 'N/A',
                this.formatCurrency(item.amount || 0, currency),
                `${item.vatRate || 0}%`,
                this.formatCurrency(item.vatAmount || 0, currency),
                item.trn || 'N/A',
              ].join(','),
            );
          });
          const totalInput = data.vatInputItems.reduce(
            (sum: number, item: any) => sum + (item.vatAmount || 0),
            0,
          );
          const totalInputAmount = data.vatInputItems.reduce(
            (sum: number, item: any) => sum + (item.amount || 0),
            0,
          );
          lines.push('');
          lines.push(
            `Total,,,${this.formatCurrency(totalInputAmount, currency)},,${this.formatCurrency(totalInput, currency)},`,
          );
          lines.push('');
          lines.push('-'.repeat(80));
          lines.push('');
        }

        // VAT Output Items
        if (
          data.vatOutputItems &&
          Array.isArray(data.vatOutputItems) &&
          data.vatOutputItems.length > 0
        ) {
          lines.push('VAT Output (Sales/Invoices)');
          lines.push('-'.repeat(80));
          lines.push(
            'Date,Description,Invoice Number,Customer,Amount,VAT Rate (%),VAT Amount,TRN',
          );
          data.vatOutputItems.forEach((item: any) => {
            const date = item.date
              ? new Date(item.date).toLocaleDateString('en-GB')
              : 'N/A';
            lines.push(
              [
                date,
                item.description ||
                  item.invoiceNumber ||
                  item.customerName ||
                  'N/A',
                item.invoiceNumber || 'N/A',
                item.customerName || 'N/A',
                this.formatCurrency(item.amount || 0, currency),
                `${item.vatRate || 0}%`,
                this.formatCurrency(item.vatAmount || 0, currency),
                item.trn || 'N/A',
              ].join(','),
            );
          });
          const totalOutput = data.vatOutputItems.reduce(
            (sum: number, item: any) => sum + (item.vatAmount || 0),
            0,
          );
          const totalOutputAmount = data.vatOutputItems.reduce(
            (sum: number, item: any) => sum + (item.amount || 0),
            0,
          );
          lines.push('');
          lines.push(
            `Total,,,,${this.formatCurrency(totalOutputAmount, currency)},,${this.formatCurrency(totalOutput, currency)},`,
          );
        }
      } else if (reportData.type === 'stock_balance') {
        // Stock Balance CSV format
        const data = reportData.data;
        const currency = reportData.metadata?.currency || 'AED';

        lines.push('Stock Balance Report');
        lines.push('');
        if (data.period) {
          if (data.period.startDate) {
            lines.push(
              `From,${new Date(data.period.startDate).toLocaleDateString('en-GB')}`,
            );
          }
          if (data.period.endDate) {
            lines.push(
              `To,${new Date(data.period.endDate).toLocaleDateString('en-GB')}`,
            );
          }
        }
        lines.push('');
        lines.push('Summary');
        lines.push('-'.repeat(80));
        if (data.summary) {
          lines.push(
            `Opening Stock,${(data.summary.totalOpeningStock || 0).toFixed(2)}`,
          );
          lines.push(
            `Stock Inwards,${(data.summary.totalStockInwards || 0).toFixed(2)}`,
          );
          lines.push(
            `Stock Outwards,${(data.summary.totalStockOutwards || 0).toFixed(2)}`,
          );
          lines.push(
            `Adjustments,${(data.summary.totalAdjustments || 0).toFixed(2)}`,
          );
          lines.push(
            `Closing Stock,${(data.summary.totalClosingStock || 0).toFixed(2)}`,
          );
          lines.push(
            `Stock Value,${this.formatCurrency(data.summary.totalStockValue || 0, currency)}`,
          );
        }
        lines.push('');
        lines.push('-'.repeat(80));
        lines.push('');

        // Products
        if (
          data.products &&
          Array.isArray(data.products) &&
          data.products.length > 0
        ) {
          lines.push('Product Stock Details');
          lines.push('-'.repeat(80));
          lines.push(
            'Product Name,SKU,Unit,Opening Stock,Stock Inwards,Stock Outwards,Adjustments,Closing Stock,Avg Cost/Unit,Stock Value',
          );
          data.products.forEach((product: any) => {
            lines.push(
              [
                product.productName || 'N/A',
                product.sku || 'N/A',
                product.unitOfMeasure || 'unit',
                (product.openingStock || 0).toFixed(2),
                (product.stockInwards || 0).toFixed(2),
                (product.stockOutwards || 0).toFixed(2),
                (product.adjustments || 0).toFixed(2),
                (product.closingStock || 0).toFixed(2),
                this.formatCurrency(product.averageCost || 0, currency),
                this.formatCurrency(product.stockValue || 0, currency),
              ].join(','),
            );
          });
          lines.push('');
          lines.push(
            [
              'TOTAL',
              '',
              '',
              (data.summary?.totalOpeningStock || 0).toFixed(2),
              (data.summary?.totalStockInwards || 0).toFixed(2),
              (data.summary?.totalStockOutwards || 0).toFixed(2),
              (data.summary?.totalAdjustments || 0).toFixed(2),
              (data.summary?.totalClosingStock || 0).toFixed(2),
              '',
              this.formatCurrency(data.summary?.totalStockValue || 0, currency),
            ].join(','),
          );
          lines.push('');
          lines.push('-'.repeat(80));
          lines.push('');
          lines.push(
            `Note: Total stock value (${this.formatCurrency(data.summary?.totalStockValue || 0, currency)}) should match the "Closing Stock (Inventory)" amount in the Balance Sheet report for the same date.`,
          );
        } else {
          lines.push('No stock movements found for the selected period.');
        }
      } else if (reportData.type === 'vat_report') {
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
      } else if (reportData.type === 'trial_balance') {
        lines.push('Trial Balance Report');
        lines.push('');
        if (data.startDate || data.endDate) {
          lines.push(
            `Report Period,${data.startDate || 'N/A'} to ${data.endDate || 'N/A'}`,
          );
        }
        lines.push('');
        lines.push('Summary');
        lines.push('-'.repeat(80));
        if (data.summary) {
          if (data.summary.openingDebit !== undefined) {
            lines.push(
              `Opening Debit,${this.formatCurrency(data.summary.openingDebit || 0, currency)}`,
            );
            lines.push(
              `Opening Credit,${this.formatCurrency(data.summary.openingCredit || 0, currency)}`,
            );
            lines.push(
              `Opening Balance,${this.formatCurrency(data.summary.openingBalance || 0, currency)}`,
            );
            lines.push('');
            lines.push(
              `Period Debit,${this.formatCurrency(data.summary.periodDebit || 0, currency)}`,
            );
            lines.push(
              `Period Credit,${this.formatCurrency(data.summary.periodCredit || 0, currency)}`,
            );
            lines.push(
              `Period Balance,${this.formatCurrency(data.summary.periodBalance || 0, currency)}`,
            );
            lines.push('');
            lines.push(
              `Closing Debit,${this.formatCurrency(data.summary.closingDebit || 0, currency)}`,
            );
            lines.push(
              `Closing Credit,${this.formatCurrency(data.summary.closingCredit || 0, currency)}`,
            );
            lines.push(
              `Closing Balance,${this.formatCurrency(data.summary.closingBalance || 0, currency)}`,
            );
            lines.push('');
          }
          lines.push('');
          lines.push('Total Summary');
          lines.push('-'.repeat(80));
          lines.push(
            `Total Debit,${this.formatCurrency(data.summary.closingDebit || data.summary.totalDebit || 0, currency)}`,
          );
          lines.push(
            `Total Credit,${this.formatCurrency(data.summary.closingCredit || data.summary.totalCredit || 0, currency)}`,
          );
          lines.push(
            `Total Balance,${this.formatCurrency(data.summary.closingBalance || data.summary.totalBalance || 0, currency)}`,
          );
        }
        lines.push('');
        lines.push('-'.repeat(80));
        lines.push('');
        if (
          data.accounts &&
          Array.isArray(data.accounts) &&
          data.accounts.length > 0
        ) {
          lines.push('Accounts');
          lines.push(
            'Account Name,Account Type,Account Code,Opening Debit,Opening Credit,Opening Balance,Period Debit,Period Credit,Period Balance,Closing Debit,Closing Credit,Closing Balance',
          );
          data.accounts.forEach((item: any) => {
            lines.push(
              [
                item.accountName || 'N/A',
                item.accountType || 'N/A',
                item.accountCode || 'N/A',
                this.formatCurrency(item.openingDebit || 0, currency),
                this.formatCurrency(item.openingCredit || 0, currency),
                this.formatCurrency(item.openingBalance || 0, currency),
                this.formatCurrency(
                  item.debit || item.periodDebit || 0,
                  currency,
                ),
                this.formatCurrency(
                  item.credit || item.periodCredit || 0,
                  currency,
                ),
                this.formatCurrency(
                  item.balance || item.periodBalance || 0,
                  currency,
                ),
                this.formatCurrency(item.closingDebit || 0, currency),
                this.formatCurrency(item.closingCredit || 0, currency),
                this.formatCurrency(item.closingBalance || 0, currency),
              ].join(','),
            );
          });
        }
      } else if (reportData.type === 'balance_sheet') {
        lines.push('Balance Sheet Report');
        lines.push('');
        if (data.startDate || data.endDate) {
          lines.push(
            `Report Period,${data.startDate || 'N/A'} to ${data.endDate || 'N/A'}`,
          );
        }
        lines.push('');
        lines.push('Summary');
        lines.push('-'.repeat(80));
        if (data.summary) {
          if (data.summary.openingAssets !== undefined) {
            lines.push(
              `Opening Assets,${this.formatCurrency(data.summary.openingAssets || 0, currency)}`,
            );
            lines.push(
              `Opening Liabilities,${this.formatCurrency(data.summary.openingLiabilities || 0, currency)}`,
            );
            lines.push(
              `Opening Equity,${this.formatCurrency(data.summary.openingEquity || 0, currency)}`,
            );
            lines.push('');
            lines.push(
              `Period Assets,${this.formatCurrency(data.summary.periodAssets || 0, currency)}`,
            );
            lines.push(
              `Period Liabilities,${this.formatCurrency(data.summary.periodLiabilities || 0, currency)}`,
            );
            lines.push(
              `Period Equity,${this.formatCurrency(data.summary.periodEquity || 0, currency)}`,
            );
            lines.push('');
            lines.push(
              `Closing Assets,${this.formatCurrency(data.summary.closingAssets || 0, currency)}`,
            );
            lines.push(
              `Closing Liabilities,${this.formatCurrency(data.summary.closingLiabilities || 0, currency)}`,
            );
            lines.push(
              `Closing Equity,${this.formatCurrency(data.summary.closingEquity || 0, currency)}`,
            );
            lines.push('');
          }
          lines.push('');
          lines.push('Total Summary');
          lines.push('-'.repeat(80));
          lines.push(
            `Total Assets,${this.formatCurrency(data.summary.closingAssets || data.summary.totalAssets || 0, currency)}`,
          );
          lines.push(
            `Total Liabilities,${this.formatCurrency(data.summary.closingLiabilities || data.summary.totalLiabilities || 0, currency)}`,
          );
          lines.push(
            `Total Equity,${this.formatCurrency(data.summary.closingEquity || data.summary.totalEquity || 0, currency)}`,
          );
        }
        lines.push('');
        lines.push('-'.repeat(80));
        lines.push('');
        if (
          data.assets &&
          data.assets.items &&
          Array.isArray(data.assets.items) &&
          data.assets.items.length > 0
        ) {
          lines.push('Assets');
          lines.push('Category,Amount');
          data.assets.items.forEach((item: any) => {
            lines.push(
              [
                item.category || 'N/A',
                this.formatCurrency(item.amount || 0, currency),
              ].join(','),
            );
          });
          lines.push(
            `Total Assets,${this.formatCurrency(data.assets.total || 0, currency)}`,
          );
          lines.push('');
        }
        if (
          data.liabilities &&
          data.liabilities.items &&
          Array.isArray(data.liabilities.items) &&
          data.liabilities.items.length > 0
        ) {
          lines.push('Liabilities');
          lines.push('Vendor,Amount');
          data.liabilities.items.forEach((item: any) => {
            lines.push(
              [
                item.vendor || 'N/A',
                this.formatCurrency(item.amount || 0, currency),
              ].join(','),
            );
          });
          lines.push(
            `Total Liabilities,${this.formatCurrency(data.liabilities.total || 0, currency)}`,
          );
          lines.push('');
        }
        if (
          data.equity &&
          data.equity.items &&
          Array.isArray(data.equity.items) &&
          data.equity.items.length > 0
        ) {
          lines.push('Equity');
          lines.push('Category,Amount');
          data.equity.items.forEach((item: any) => {
            lines.push(
              [
                item.category || 'N/A',
                this.formatCurrency(item.amount || 0, currency),
              ].join(','),
            );
          });
          lines.push(
            `Total Equity,${this.formatCurrency(data.equity.total || 0, currency)}`,
          );
        }
      } else if (reportData.type === 'profit_and_loss') {
        lines.push('Profit and Loss Statement');
        lines.push('');
        if (data.startDate || data.endDate) {
          lines.push(
            `Report Period,${data.startDate || 'N/A'} to ${data.endDate || 'N/A'}`,
          );
        }
        lines.push('');
        lines.push('Summary');
        lines.push('-'.repeat(80));
        if (data.summary) {
          if (data.summary.openingRetainedEarnings !== undefined) {
            lines.push(
              `Opening Retained Earnings,${this.formatCurrency(data.summary.openingRetainedEarnings || 0, currency)}`,
            );
            lines.push(
              `Period Net Profit,${this.formatCurrency(data.summary.netProfit || 0, currency)}`,
            );
            lines.push(
              `Closing Retained Earnings,${this.formatCurrency(data.summary.closingRetainedEarnings || 0, currency)}`,
            );
            lines.push('');
          }
          lines.push(
            `Revenue,${this.formatCurrency(data.summary.grossProfit || 0, currency)}`,
          );
          lines.push(
            `Total Expenses,${this.formatCurrency(data.summary.totalExpenses || 0, currency)}`,
          );
          lines.push(
            `Net Profit,${this.formatCurrency(data.summary.netProfit || 0, currency)}`,
          );
          if (data.summary.netProfitMargin) {
            lines.push(`Profit Margin,${data.summary.netProfitMargin}%`);
          }
        }
        lines.push('');
        lines.push('-'.repeat(80));
        lines.push('');
        if (data.revenue) {
          lines.push('Revenue');
          lines.push(
            `Amount,${this.formatCurrency(data.revenue.amount || 0, currency)}`,
          );
          lines.push(
            `VAT,${this.formatCurrency(data.revenue.vat || 0, currency)}`,
          );
          lines.push(
            `Total,${this.formatCurrency(data.revenue.total || 0, currency)}`,
          );
          lines.push('');
        }
        if (
          data.expenses &&
          data.expenses.items &&
          Array.isArray(data.expenses.items) &&
          data.expenses.items.length > 0
        ) {
          lines.push('Expenses');
          lines.push('Category,Amount,VAT,Total');
          data.expenses.items.forEach((item: any) => {
            lines.push(
              [
                item.category || 'N/A',
                this.formatCurrency(item.amount || 0, currency),
                this.formatCurrency(item.vat || 0, currency),
                this.formatCurrency(item.total || 0, currency),
              ].join(','),
            );
          });
          lines.push(
            `Total Expenses,${this.formatCurrency(data.expenses.grandTotal || 0, currency)},,`,
          );
        }
      } else if (reportData.type === 'payables') {
        lines.push('Payables (Accruals) Report');
        lines.push('');
        if (data.asOfDate) {
          lines.push(`As of Date,${data.asOfDate}`);
        }
        if (data.startDate || data.endDate) {
          lines.push(
            `Report Period,${data.startDate || 'N/A'} to ${data.endDate || 'N/A'}`,
          );
        }
        lines.push('');
        lines.push('Summary');
        lines.push('-'.repeat(80));
        if (data.summary) {
          if (data.summary.openingBalance !== undefined) {
            lines.push(
              `Opening Balance,${this.formatCurrency(data.summary.openingBalance || 0, currency)}`,
            );
            lines.push(
              `Period Amount,${this.formatCurrency(data.summary.periodAmount || 0, currency)}`,
            );
            lines.push(
              `Closing Balance,${this.formatCurrency(data.summary.closingBalance || 0, currency)}`,
            );
            lines.push('');
          }
          lines.push(`Total Items,${data.summary.totalItems || 0}`);
          lines.push(
            `Total Amount,${this.formatCurrency(data.summary.totalAmount || 0, currency)}`,
          );
          lines.push(`Overdue Items,${data.summary.overdueItems || 0}`);
          lines.push(
            `Overdue Amount,${this.formatCurrency(data.summary.overdueAmount || 0, currency)}`,
          );
          if (data.summary.totalSuppliers !== undefined) {
            lines.push(`Total Suppliers,${data.summary.totalSuppliers || 0}`);
          }
        }
        lines.push('');
        lines.push('-'.repeat(80));
        lines.push('');
        if (data.items && Array.isArray(data.items) && data.items.length > 0) {
          lines.push('Payables');
          lines.push(
            'Vendor,Description,Invoice Number,Amount,VAT Amount,Total Amount,Expected Date,Due Date,Status,Payment Method,Reference Number,Notes',
          );
          data.items.forEach((item: any) => {
            const expectedDate = item.expectedDate
              ? new Date(item.expectedDate).toLocaleDateString('en-GB')
              : 'N/A';
            const dueDate = item.dueDate
              ? new Date(item.dueDate).toLocaleDateString('en-GB')
              : 'N/A';
            lines.push(
              [
                item.vendor || item.vendorName || 'N/A',
                item.description || 'N/A',
                item.invoiceNumber || 'N/A',
                this.formatCurrency(item.amount || 0, currency),
                this.formatCurrency(item.vatAmount || 0, currency),
                this.formatCurrency(
                  item.totalAmount || item.amount + (item.vatAmount || 0) || 0,
                  currency,
                ),
                expectedDate,
                dueDate,
                item.status || 'N/A',
                item.paymentMethod || 'N/A',
                item.referenceNumber || 'N/A',
                item.notes || 'N/A',
              ].join(','),
            );
          });
        }

        // Supplier Summary Section
        if (
          data.supplierSummary &&
          Array.isArray(data.supplierSummary) &&
          data.supplierSummary.length > 0
        ) {
          lines.push('');
          lines.push('-'.repeat(80));
          lines.push('Supplier Summary (Pending Balances)');
          lines.push(
            'Supplier,Pending Balance,Item Count,Overdue Amount,Overdue Count',
          );
          data.supplierSummary.forEach((supplier: any) => {
            lines.push(
              [
                supplier.vendor || 'N/A',
                this.formatCurrency(supplier.pendingBalance || 0, currency),
                supplier.itemCount || 0,
                this.formatCurrency(supplier.overdueAmount || 0, currency),
                supplier.overdueCount || 0,
              ].join(','),
            );
          });
          const totalPendingBalance = data.supplierSummary.reduce(
            (sum: number, s: any) => sum + (s.pendingBalance || 0),
            0,
          );
          const totalOverdueAmount = data.supplierSummary.reduce(
            (sum: number, s: any) => sum + (s.overdueAmount || 0),
            0,
          );
          lines.push(
            [
              'Total',
              this.formatCurrency(totalPendingBalance, currency),
              data.summary?.totalItems || 0,
              this.formatCurrency(totalOverdueAmount, currency),
              data.summary?.overdueItems || 0,
            ].join(','),
          );
        }
      } else if (reportData.type === 'receivables') {
        lines.push('Receivables Report');
        lines.push('');
        if (data.startDate || data.endDate) {
          lines.push(
            `Report Period,${data.startDate || 'N/A'} to ${data.endDate || 'N/A'}`,
          );
        }
        lines.push('');
        lines.push('Summary');
        lines.push('-'.repeat(80));
        if (data.summary) {
          if (data.summary.openingBalance !== undefined) {
            lines.push(
              `Opening Balance,${this.formatCurrency(data.summary.openingBalance || 0, currency)}`,
            );
            lines.push(
              `Period Amount,${this.formatCurrency(data.summary.periodAmount || data.summary.periodOutstanding || 0, currency)}`,
            );
            lines.push(
              `Closing Balance,${this.formatCurrency(data.summary.closingBalance || 0, currency)}`,
            );
            lines.push('');
          }
          lines.push(`Total Invoices,${data.summary.totalInvoices || 0}`);
          lines.push(
            `Total Outstanding,${this.formatCurrency(data.summary.totalOutstanding || 0, currency)}`,
          );
          lines.push(`Overdue Invoices,${data.summary.overdueInvoices || 0}`);
          lines.push(
            `Overdue Amount,${this.formatCurrency(data.summary.overdueAmount || 0, currency)}`,
          );
        }
        lines.push('');
        lines.push('-'.repeat(80));
        lines.push('');
        if (data.items && Array.isArray(data.items) && data.items.length > 0) {
          lines.push('Receivables');
          lines.push(
            'Invoice Number,Invoice Date,Customer,Customer TRN,Description,Amount,VAT Amount,Total Amount,Paid Amount,Outstanding,Due Date,Payment Status,Status,Currency,Notes',
          );
          data.items.forEach((item: any) => {
            const invoiceDate = item.invoiceDate
              ? new Date(item.invoiceDate).toLocaleDateString('en-GB')
              : 'N/A';
            const dueDate = item.dueDate
              ? new Date(item.dueDate).toLocaleDateString('en-GB')
              : 'N/A';
            lines.push(
              [
                item.invoiceNumber || 'N/A',
                invoiceDate,
                item.customer || item.customerName || 'N/A',
                item.customerTrn || 'N/A',
                item.description || 'N/A',
                this.formatCurrency(item.amount || 0, currency),
                this.formatCurrency(item.vatAmount || 0, currency),
                this.formatCurrency(
                  item.total || item.totalAmount || 0,
                  currency,
                ),
                this.formatCurrency(item.paidAmount || 0, currency),
                this.formatCurrency(item.outstanding || 0, currency),
                dueDate,
                item.paymentStatus || 'N/A',
                item.status || 'N/A',
                item.currency || currency,
                item.notes || 'N/A',
              ].join(','),
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

  /**
   * Generate professional invoice PDF matching UAE Tax Invoice format
   * Premium design inspired by Xero/Tally with clean lines and professional styling
   */
  private async generateInvoicePDF(reportData: ReportData): Promise<Buffer> {
    const metadata = reportData.metadata || {};
    const invoiceTemplate = (metadata as any).invoiceTemplate || {};
    const logoUrl = invoiceTemplate.logoUrl || metadata.logoUrl;

    // Use logo buffer from invoiceTemplate or metadata (pre-fetched from private storage) or fetch from remote URL
    let logoBuffer: Buffer | null = invoiceTemplate.logoBuffer || (metadata as any).logoBuffer || null;

    if (
      !logoBuffer &&
      logoUrl &&
      (logoUrl.startsWith('http://') || logoUrl.startsWith('https://'))
    ) {
      logoBuffer = await this.fetchImageAsBuffer(logoUrl);
    }

    return new Promise((resolve, reject) => {
      try {
        const invoice = reportData.data;
        const organization = invoice.organization;
        const customer = invoice.customer;
        const currency = metadata.currency || invoice.currency || 'AED';

        const doc = new PDFDocument({
          margin: 56, // Increased from 50 to match premium preview (48px = ~56pt)
          size: 'A4',
          layout: 'portrait',
        });

        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        const pageWidth = doc.page.width;
        const margin = 56; // Increased from 50 to match premium preview
        const rightMarginExtra = 24; // Extra space on right so invoice isn't flush to edge
        const contentWidth = pageWidth - 2 * margin - rightMarginExtra;

        // Get template settings from metadata
        // For proforma invoices, always use "PROFORMA INVOICE" as title
        const defaultInvoiceTitle = invoice.status?.toLowerCase() === 'proforma_invoice' 
          ? 'PROFORMA INVOICE' 
          : (invoiceTemplate.invoiceTitle || 'TAX INVOICE');
        
        const templateSettings = {
          logoUrl: logoUrl,
          logoBuffer: logoBuffer, // Pre-fetched logo buffer for remote URLs
          headerText: invoiceTemplate.headerText,
          colorScheme: invoiceTemplate.colorScheme || 'blue',
          customColor: invoiceTemplate.customColor,
          invoiceTitle: defaultInvoiceTitle,
          showCompanyDetails: invoiceTemplate.showCompanyDetails ?? true,
          showVatDetails: invoiceTemplate.showVatDetails ?? true,
          showPaymentTerms: invoiceTemplate.showPaymentTerms ?? true,
          showPaymentMethods: invoiceTemplate.showPaymentMethods ?? true,
          showBankDetails: invoiceTemplate.showBankDetails ?? false,
          showTermsAndConditions:
            invoiceTemplate.showTermsAndConditions ?? true,
          paymentTerms: invoiceTemplate.paymentTerms,
          defaultNotes: invoiceTemplate.defaultNotes,
          termsAndConditions: invoiceTemplate.termsAndConditions,
          footerText: invoiceTemplate.footerText,
          showFooter: invoiceTemplate.showFooter ?? true,
          showItemDescription: invoiceTemplate.showItemDescription ?? true,
          showItemQuantity: invoiceTemplate.showItemQuantity ?? true,
          showItemUnitPrice: invoiceTemplate.showItemUnitPrice ?? true,
          showItemTotal: invoiceTemplate.showItemTotal ?? true,
        };

        // Color scheme based on template settings
        const getColorScheme = () => {
          const scheme = templateSettings.colorScheme || 'blue';
          const customColor = templateSettings.customColor;

          if (scheme === 'custom' && customColor) {
            return customColor;
          }

          const colorMap: Record<string, string> = {
            blue: '#1976d2',
            green: '#2e7d32',
            purple: '#7b1fa2',
            orange: '#f57c00',
            red: '#d32f2f',
          };

          return colorMap[scheme] || colorMap.blue;
        };

        const primaryColor = getColorScheme();

        const colors = {
          primary: primaryColor,
          text: '#0f172a',
          textLight: '#475569',
          textMuted: '#94a3b8',
          border: '#e2e8f0',
          borderLight: '#f1f5f9',
          background: '#ffffff',
          backgroundLight: '#f8fafc',
          backgroundDark: '#0f172a', // For dark table header
        };

        // Currency formatting helper
        const formatAmount = (value: number | string): string => {
          const numValue =
            typeof value === 'string' ? parseFloat(value) : value;
          if (isNaN(numValue)) return '0.00';
          return numValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        };

        // ============================================================================
        // TOP BORDER BAR (Premium 6px border matching preview)
        // ============================================================================
        doc.fillColor(colors.primary).rect(0, 0, pageWidth, 6).fill();

        // ============================================================================
        // HEADER: Logo on left, Title on right (Premium layout matching preview)
        // ============================================================================
        let currentY = 40;
        let logoHeight = 0;

        // Add logo on the left if available
        if (templateSettings.logoBuffer) {
          try {
            // Check if buffer contains SVG content (PDFKit doesn't support SVG)
            const bufferStart = templateSettings.logoBuffer
              .slice(0, 100)
              .toString('utf-8')
              .toLowerCase();
            if (bufferStart.includes('<svg') || bufferStart.includes('<?xml')) {
              console.warn(
                "Skipping SVG invoice logo buffer (PDFKit doesn't support SVG)",
              );
            } else {
              const logoSize = 140; // Match preview size (140px)
              const logoX = margin;
              const logoY = currentY;
              logoHeight = logoSize;

              doc.image(templateSettings.logoBuffer, logoX, logoY, {
                width: logoSize,
                height: logoSize,
                fit: [logoSize, logoSize],
              });
            }
          } catch (error) {
            console.warn('Failed to load invoice logo:', error);
            // No placeholder - just skip logo if it fails
          }
        } else if (
          templateSettings.logoUrl &&
          !templateSettings.logoUrl.startsWith('http://') &&
          !templateSettings.logoUrl.startsWith('https://') &&
          fs.existsSync(templateSettings.logoUrl)
        ) {
          try {
            // Skip SVG files as PDFKit doesn't support them
            const ext = path.extname(templateSettings.logoUrl).toLowerCase();
            if (ext !== '.svg') {
              const logoSize = 140; // Match preview size (140px)
              const logoX = margin;
              const logoY = currentY;
              logoHeight = logoSize;

              doc.image(templateSettings.logoUrl, logoX, logoY, {
                width: logoSize,
                height: logoSize,
                fit: [logoSize, logoSize],
              });
            } else {
              console.warn(
                "Skipping SVG invoice logo file (PDFKit doesn't support SVG)",
              );
            }
          } catch (error) {
            console.warn('Failed to load invoice logo from file:', error);
            // No placeholder - just skip logo if it fails
          }
        }
        // No placeholder text - if no logo is configured, just skip it

        // Invoice Title - Right aligned (matching premium preview)
        // Position title to align with top of logo or at currentY if no logo
        const invoiceStatus = invoice.status;
        let invoiceTitle: string;
        
        // For proforma invoices, always show "PROFORMA INVOICE"
        if (invoiceStatus?.toLowerCase() === 'proforma_invoice') {
          invoiceTitle = 'PROFORMA INVOICE';
        } else {
          invoiceTitle = templateSettings.invoiceTitle || 'TAX INVOICE';
          if (invoiceStatus) {
            const statusMap: Record<string, string> = {
              'tax_invoice_receivable': 'RECEIVABLE',
              'tax_invoice_bank_received': 'BANK RECEIVED',
              'tax_invoice_cash_received': 'CASH RECEIVED',
            };
            const statusDisplay = statusMap[invoiceStatus.toLowerCase()];
            if (statusDisplay) {
              invoiceTitle = `${invoiceTitle} - ${statusDisplay}`;
            }
          }
        }
        // Decreased heading font size, standardize to match rest of content
        // Position title at same Y as logo start to avoid overlap
        doc.fontSize(14).font('Helvetica-Bold').fillColor(colors.primary);
        doc.text(invoiceTitle.toUpperCase(), margin, currentY, {
          width: contentWidth,
          align: 'right',
        });

        // Header text if available - position below title
        let titleHeight = 18; // Approximate height for 14px font
        if (templateSettings.headerText) {
          doc.fontSize(10).font('Helvetica').fillColor(colors.text); // Use dark text color
          doc.text(templateSettings.headerText, margin, currentY + titleHeight, {
            width: contentWidth,
            align: 'right',
          });
          titleHeight += 14;
        }

        // Set currentY to the bottom of logo or title, whichever is lower - reduce spacing
        const logoBottom = currentY + logoHeight;
        const titleBottom = currentY + titleHeight;
        currentY = Math.max(logoBottom, titleBottom) + 10; // Reduced from 20 to 10

        // ============================================================================
        // SEPARATOR LINE (Premium 2px border with accent)
        // ============================================================================
        doc.strokeColor(colors.border).lineWidth(2);
        doc
          .moveTo(margin, currentY)
          .lineTo(margin + contentWidth, currentY)
          .stroke();

        // Accent line below separator
        doc.strokeColor(colors.primary).lineWidth(1);
        doc
          .moveTo(margin, currentY + 2)
          .lineTo(margin + 120, currentY + 2)
          .stroke();

        currentY += 20; // Reduced from 32 to 20

        // ============================================================================
        // COMPANY DETAILS SECTION (Premium styled with background)
        // ============================================================================
        if (templateSettings.showCompanyDetails) {
          const companyBoxY = currentY;
          let contentStartY = companyBoxY + 12;
          let tempY = contentStartY;

          // Calculate content first to determine box height
          const orgName = organization?.name || metadata.organizationName || '';
          if (orgName) {
            tempY += 16; // Company name
          }

          const orgAddress = organization?.address || metadata.address || '';
          if (orgAddress) {
            tempY += 14;
          }

          const orgPhone = organization?.phone || metadata.phone || '';
          if (orgPhone) {
            tempY += 14;
          }

          const orgEmail = organization?.contactEmail || metadata.email || '';
          if (orgEmail) {
            tempY += 14;
          }

          if (templateSettings.showVatDetails) {
            const orgTrn = organization?.vatNumber || metadata.vatNumber || '';
            if (orgTrn) {
              tempY += 14;
            }
          }

          // Calculate box height based on content
          const companyBoxHeight = Math.max(tempY - companyBoxY + 12, 60);

          // Draw background box with left border accent FIRST
          doc
            .fillColor(colors.backgroundLight)
            .rect(margin, companyBoxY, contentWidth, companyBoxHeight)
            .fill();
          doc
            .strokeColor(colors.border)
            .lineWidth(0.5)
            .rect(margin, companyBoxY, contentWidth, companyBoxHeight)
            .stroke();

          // Left border accent
          doc
            .fillColor(colors.primary)
            .rect(margin, companyBoxY, 4, companyBoxHeight)
            .fill();

          // Now write the text content on top of the box
          currentY = contentStartY;

          if (orgName) {
            // Standardize font size to 10px
            doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.text);
            doc.text(orgName, margin + 20, currentY);
            currentY += 16;
          }

          // Standardize font size to 10px - use dark text color for visibility
          doc.fontSize(10).font('Helvetica').fillColor(colors.text);

          if (orgAddress) {
            doc.text(orgAddress, margin + 20, currentY);
            currentY += 14;
          }

          if (orgPhone) {
            doc.text(`Phone: ${orgPhone}`, margin + 20, currentY);
            currentY += 14;
          }

          if (orgEmail) {
            doc.text(`Email: ${orgEmail}`, margin + 20, currentY);
            currentY += 14;
          }

          if (templateSettings.showVatDetails) {
            const orgTrn = organization?.vatNumber || metadata.vatNumber || '';
            if (orgTrn) {
              doc.fontSize(10).font('Helvetica').fillColor(colors.text);
              doc.text(`TRN: ${orgTrn}`, margin + 20, currentY);
              currentY += 14;
            }
          }

          currentY = companyBoxY + companyBoxHeight + 12;
        } else {
          currentY += 20;
        }

        // ============================================================================
        // INVOICE DETAILS BOX (3-column layout: Bill To / Invoice Details / Commercial)
        // ============================================================================
        const boxY = currentY;
        const headerHeight = 140; // fixed height that comfortably fits all header lines

        // Three equal-width columns inside the box
        const innerX = margin + 20;
        const innerWidth = contentWidth - 40;
        const columnGap = 18;
        const columnWidth = (innerWidth - columnGap * 2) / 3;

        const billToX = innerX;
        const invoiceX = innerX + columnWidth + columnGap;
        const commercialX = innerX + (columnWidth + columnGap) * 2;

        // Draw premium background box with border
        doc
          .fillColor(colors.backgroundLight)
          .rect(margin, boxY, contentWidth, headerHeight)
          .fill();
        doc
          .strokeColor(colors.border)
          .lineWidth(1)
          .rect(margin, boxY, contentWidth, headerHeight)
          .stroke();

        // Vertical separators between the three columns
        const sep1X = invoiceX - columnGap / 2;
        const sep2X = commercialX - columnGap / 2;
        doc.strokeColor(colors.border).lineWidth(1);
        doc
          .moveTo(sep1X, boxY + 10)
          .lineTo(sep1X, boxY + headerHeight - 10)
          .stroke();
        doc
          .moveTo(sep2X, boxY + 10)
          .lineTo(sep2X, boxY + headerHeight - 10)
          .stroke();

        const colHeaderGap = 10;
        const lineGap = 3;

        // Small helper to render "LABEL: value" with bold label and regular value
        const drawLabelValue = (
          label: string,
          value: string,
          x: number,
          y: number,
          width: number,
        ): number => {
          const labelText = `${label}: `;
          doc.fontSize(9).font('Helvetica-Bold').fillColor(colors.text);
          doc.text(labelText, x, y, { width });
          const labelWidth = doc.widthOfString(labelText);

          doc.fontSize(9).font('Helvetica').fillColor(colors.text);
          doc.text(value, x + labelWidth, y, { width: width - labelWidth });

          // Return total line height for spacing calculations
          return doc.heightOfString(`${labelText}${value}`, { width });
        };

        // Column 1 - BILL TO
        let billToY = boxY + 16;
        const customerName = customer?.name || invoice.customerName || '';
        const customerAddress = customer?.address || '';
        const customerPhone = customer?.phone || '';
        const customerEmail = customer?.email || '';
        const customerTrn =
          templateSettings.showVatDetails && (customer?.customerTrn || invoice.customerTrn)
            ? (customer?.customerTrn || invoice.customerTrn)
            : '';

        doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.text);
        doc.text('BILL TO:', billToX, billToY, { width: columnWidth });
        billToY += colHeaderGap;

        if (customerName) {
          const h = doc.heightOfString(customerName, { width: columnWidth });
          doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.text);
          doc.text(customerName, billToX, billToY, { width: columnWidth });
          billToY += h + lineGap;
        }

        if (customerAddress) {
          const line = customerAddress;
          const h = doc.heightOfString(line, { width: columnWidth });
          doc.fontSize(9).font('Helvetica').fillColor(colors.text);
          doc.text(line, billToX, billToY, { width: columnWidth });
          billToY += h + lineGap;
        }

        if (customerPhone) {
          const line = `Phone: ${customerPhone}`;
          const h = doc.heightOfString(line, { width: columnWidth });
          doc.fontSize(9).font('Helvetica').fillColor(colors.text);
          doc.text(line, billToX, billToY, { width: columnWidth });
          billToY += h + lineGap;
        }

        if (customerEmail) {
          const line = `Email: ${customerEmail}`;
          const h = doc.heightOfString(line, { width: columnWidth });
          doc.fontSize(9).font('Helvetica').fillColor(colors.text);
          doc.text(line, billToX, billToY, { width: columnWidth });
          billToY += h + lineGap;
        }

        if (customerTrn) {
          const line = `TRN: ${customerTrn}`;
          const h = doc.heightOfString(line, { width: columnWidth });
          doc.fontSize(9).font('Helvetica').fillColor(colors.text);
          doc.text(line, billToX, billToY, { width: columnWidth });
          billToY += h + lineGap;
        }

        // Column 2 - INVOICE DETAILS
        let invoiceY = boxY + 16;
        doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.text);
        doc.text('INVOICE DETAILS', invoiceX, invoiceY, { width: columnWidth });
        invoiceY += colHeaderGap;

        const invoiceNumberLabel =
          invoice.status?.toLowerCase() === 'proforma_invoice'
            ? 'PROFORMA INVOICE NO.'
            : 'INVOICE NUMBER';
        let h = drawLabelValue(
          invoiceNumberLabel,
          invoice.invoiceNumber || '',
          invoiceX,
          invoiceY,
          columnWidth,
        );
        invoiceY += h + lineGap;

        const invoiceDateLabel =
          invoice.status?.toLowerCase() === 'proforma_invoice'
            ? 'PROFORMA INVOICE DATE'
            : 'INVOICE DATE';
        h = drawLabelValue(
          invoiceDateLabel,
          this.formatDateForInvoice(invoice.invoiceDate || ''),
          invoiceX,
          invoiceY,
          columnWidth,
        );
        invoiceY += h + lineGap;

        if (invoice.dueDate) {
          h = drawLabelValue(
            'DUE DATE',
            this.formatDateForInvoice(invoice.dueDate),
            invoiceX,
            invoiceY,
            columnWidth,
          );
          invoiceY += h + lineGap;
        }

        if (templateSettings.showPaymentTerms) {
          const paymentTerms =
            templateSettings.paymentTerms ||
            (customer?.paymentTerms ? `Net ${customer.paymentTerms}` : 'Net 30');
          h = drawLabelValue('PAYMENT TERMS', paymentTerms, invoiceX, invoiceY, columnWidth);
          invoiceY += h + lineGap;
        }

        // Column 3 - COMMERCIAL DETAILS
        let commercialY = boxY + 16;
        doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.text);
        doc.text('COMMERCIAL DETAILS', commercialX, commercialY, { width: columnWidth });
        commercialY += colHeaderGap;

        const commercialLines: { label: string; value: string }[] = [];
        const deliveryNote = (invoice as any).deliveryNote as string | undefined;
        if (deliveryNote) {
          commercialLines.push({ label: 'DELIVERY NOTE', value: deliveryNote });
        }

        const suppliersRef = (invoice as any).suppliersRef as string | undefined;
        if (suppliersRef) {
          commercialLines.push({ label: "SUPPLIER'S REF", value: suppliersRef });
        }

        const otherReference = (invoice as any).otherReference as string | undefined;
        if (otherReference) {
          commercialLines.push({ label: 'OTHER REFERENCE', value: otherReference });
        }

        const buyerOrderNo = (invoice as any).buyerOrderNo as string | undefined;
        if (buyerOrderNo) {
          commercialLines.push({ label: 'BUYER ORDER NO.', value: buyerOrderNo });
        }

        const buyerOrderDate = (invoice as any).buyerOrderDate as string | undefined;
        if (buyerOrderDate) {
          commercialLines.push({
            label: 'DATED',
            value: this.formatDateForInvoice(buyerOrderDate),
          });
        }

        const despatchedThrough = (invoice as any).despatchedThrough as string | undefined;
        if (despatchedThrough) {
          commercialLines.push({
            label: 'DESPATCHED THROUGH',
            value: despatchedThrough,
          });
        }

        const destination = (invoice as any).destination as string | undefined;
        if (destination) {
          commercialLines.push({ label: 'DESTINATION', value: destination });
        }

        for (const { label, value } of commercialLines) {
          const lh = drawLabelValue(label, value, commercialX, commercialY, columnWidth);
          commercialY += lh + lineGap;
        }

        // Position next section below the tallest column or the fixed box height
        const headerBottomY = Math.max(billToY, invoiceY, commercialY);
        currentY = Math.max(headerBottomY + 24, boxY + headerHeight + 24);

        // ============================================================================
        // LINE ITEMS TABLE - Clean modern design matching preview
        // ============================================================================
        const lineItems = invoice.lineItems || [];
        const tableTop = currentY;
        const tableStartX = margin;

        // Column widths for cleaner table: Item, Description, Qty, Unit Price, Total
        // Keep total width safely within contentWidth to avoid overflow
        const colWidths = {
          item: 80,
          description: 145,
          quantity: 70,
          unitPrice: 95,
          total: 90,
        };
        const tableWidth = colWidths.item + colWidths.description + colWidths.quantity + colWidths.unitPrice + colWidths.total;
        const rowHeight = 32; // Increased for better padding

        // Table Header row - Premium dark background with white text
        let tableX = tableStartX;
        const headerY = tableTop;

        // Draw dark header background
        doc
          .fillColor(colors.backgroundDark)
          .rect(tableStartX, headerY, tableWidth, rowHeight)
          .fill();

        // Draw header text in white with right-aligned numeric columns
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#ffffff');

        doc.text('Item', tableX + 14, headerY + 12, {
          width: colWidths.item - 28,
        });
        tableX += colWidths.item;
        doc.text('Description', tableX + 14, headerY + 12, {
          width: colWidths.description - 28,
        });
        tableX += colWidths.description;
        doc.text('Qty', tableX + 14, headerY + 12, {
          align: 'right',
          width: colWidths.quantity - 28,
        });
        tableX += colWidths.quantity;
        doc.text('Unit Price', tableX + 14, headerY + 12, {
          align: 'right',
          width: colWidths.unitPrice - 28,
        });
        tableX += colWidths.unitPrice;
        doc.text('Total', tableX + 14, headerY + 12, {
          align: 'right',
          width: colWidths.total - 28,
        });

        let rowY = headerY + rowHeight;

        // Table Rows - Clean design matching preview with alternating row colors
        lineItems.forEach((item: any, index: number) => {
          // Check if we need a new page
          if (rowY + rowHeight > doc.page.height - 150) {
            doc.addPage();
            rowY = margin + 40;

            // Redraw table header on new page with dark background
            tableX = tableStartX;

            // Draw dark header background
            doc
              .fillColor(colors.backgroundDark)
              .rect(tableStartX, rowY, tableWidth, rowHeight)
              .fill();

            doc.fontSize(10).font('Helvetica-Bold').fillColor('#ffffff');
            doc.text('Item', tableX + 14, rowY + 12, {
              width: colWidths.item - 28,
            });
            tableX += colWidths.item;
            doc.text('Description', tableX + 14, rowY + 12, {
              width: colWidths.description - 28,
            });
            tableX += colWidths.description;
            doc.text('Qty', tableX + 14, rowY + 12, {
              align: 'right',
              width: colWidths.quantity - 28,
            });
            tableX += colWidths.quantity;
            doc.text('Unit Price', tableX + 14, rowY + 12, {
              align: 'right',
              width: colWidths.unitPrice - 28,
            });
            tableX += colWidths.unitPrice;
            doc.text('Total', tableX + 14, rowY + 12, {
              align: 'right',
              width: colWidths.total - 28,
            });
            rowY += rowHeight;
          }

          // Draw alternating row background for better readability
          if (index % 2 === 0) {
            doc
              .fillColor(colors.backgroundLight)
              .rect(tableStartX, rowY, tableWidth, rowHeight)
              .fill();
          }

          // Draw row content
          tableX = tableStartX;

          // Reset font color for row content - standardize to 10px
          doc.fontSize(10).font('Helvetica').fillColor(colors.text);

          // Item name
          doc.text(item.itemName || '', tableX + 14, rowY + 12, {
            width: colWidths.item - 28,
          });
          tableX += colWidths.item;

          // Description
          doc.text(item.description || '', tableX + 14, rowY + 12, {
            width: colWidths.description - 28,
          });
          tableX += colWidths.description;

          // Quantity with unit (right-aligned)
          const qty = parseFloat(item.quantity || '0');
          const unit = item.unitOfMeasure || 'unit';
          doc.text(
            `${formatAmount(qty).replace(/,/g, '')} ${unit}`,
            tableX + 14,
            rowY + 12,
            {
              align: 'right',
              width: colWidths.quantity - 28,
            },
          );
          tableX += colWidths.quantity;

          // Unit Price (right-aligned)
          const unitPrice = parseFloat(item.unitPrice || '0');
          doc.text(
            `${formatAmount(unitPrice)} ${currency}`,
            tableX + 14,
            rowY + 12,
            {
              align: 'right',
              width: colWidths.unitPrice - 28,
            },
          );
          tableX += colWidths.unitPrice;

          // Total (item.amount = quantity × unitPrice, before VAT, right-aligned)
          const lineTotal = parseFloat(item.amount || '0');
          doc.text(
            `${formatAmount(lineTotal)} ${currency}`,
            tableX + 14,
            rowY + 12,
            {
              align: 'right',
              width: colWidths.total - 28,
            },
          );

          // Subtle row separator
          doc.strokeColor(colors.borderLight).lineWidth(0.5);
          doc
            .moveTo(tableStartX, rowY + rowHeight)
            .lineTo(tableStartX + tableWidth, rowY + rowHeight)
            .stroke();

          rowY += rowHeight;
        });

        // Table bottom border
        doc.strokeColor(colors.border).lineWidth(0.5);
        doc
          .moveTo(tableStartX, rowY)
          .lineTo(tableStartX + tableWidth, rowY)
          .stroke();

        currentY = rowY + 25;

        // ============================================================================
        // TOTALS SECTION - Premium design matching preview
        // ============================================================================
        const totalsX = margin + contentWidth - 250;
        const totalVat = parseFloat(invoice.vatAmount || '0');
        const subtotal = parseFloat(invoice.amount || '0');
        const totalAmount = parseFloat(invoice.totalAmount || '0');

        // Totals box background
        const totalsBoxY = currentY;
        const totalsBoxHeight = 110; // Increased for better padding

        doc
          .fillColor(colors.backgroundLight)
          .rect(totalsX - 20, totalsBoxY, 270, totalsBoxHeight)
          .fill();
        doc
          .strokeColor(colors.border)
          .lineWidth(1)
          .rect(totalsX - 20, totalsBoxY, 270, totalsBoxHeight)
          .stroke();

        let totalsY = totalsBoxY + 24; // Increased padding

        // Subtotal row - standardize to 10px - use dark text color
        doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.text);
        doc.text('Subtotal:', totalsX, totalsY);
        doc.font('Helvetica-Bold').fillColor(colors.text);
        doc.text(
          `${formatAmount(subtotal)} ${currency}`,
          totalsX + 150,
          totalsY,
          {
            width: 100,
            align: 'right',
          },
        );
        totalsY += 20; // Increased spacing

        // VAT row - standardize to 10px - use dark text color
        doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.text);
        doc.text('VAT:', totalsX, totalsY);
        doc.font('Helvetica-Bold').fillColor(colors.text);
        doc.text(
          `${formatAmount(totalVat)} ${currency}`,
          totalsX + 150,
          totalsY,
          {
            width: 100,
            align: 'right',
          },
        );
        totalsY += 24; // Increased spacing

        // Separator line before total
        doc.strokeColor(colors.border).lineWidth(1);
        doc
          .moveTo(totalsX - 10, totalsY)
          .lineTo(totalsX + 250, totalsY)
          .stroke();
        totalsY += 18; // Increased spacing

        // Total Amount row - standardize to 10px (keep bold and primary color for value)
        doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.text);
        doc.text('Total Amount:', totalsX, totalsY);
        doc.fontSize(10).fillColor(colors.primary);
        doc.text(
          `${formatAmount(totalAmount)} ${currency}`,
          totalsX + 150,
          totalsY,
          { width: 100, align: 'right' },
        );

        currentY = totalsBoxY + totalsBoxHeight + 30;

        // ============================================================================
        // AMOUNT IN WORDS - below totals, above bank details
        // ============================================================================
        const totalNumeric =
          typeof totalAmount === 'string'
            ? parseFloat(totalAmount || '0')
            : totalAmount || 0;
        const amountInWords = this.numberToWords(Math.floor(totalNumeric));

        if (!isNaN(totalNumeric)) {
          if (currentY > doc.page.height - 200) {
            doc.addPage();
            currentY = margin + 40;
          }

          doc.fontSize(9).font('Helvetica-Bold').fillColor(colors.text);
          doc.text('Amount Chargeable (in words):', margin, currentY);
          currentY += 14;

          doc.fontSize(9).font('Helvetica').fillColor(colors.text);
          const currencyLabel = (metadata.currency || 'AED').toUpperCase();
          const wordsLine = `${currencyLabel} ${amountInWords} Only`;
          doc.text(wordsLine, margin, currentY, {
            width: contentWidth,
          });
          currentY += 22;
        }

        // ============================================================================
        // DEFAULT NOTES - Display default notes if provided
        // ============================================================================
        if (
          templateSettings.defaultNotes &&
          templateSettings.defaultNotes.trim().length > 0
        ) {
          // Check if we need a new page for notes (reserve 120pt for notes + spacing)
          if (currentY > doc.page.height - 200) {
            doc.addPage();
            currentY = margin + 40;
          }
          
          currentY += 20;
          doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.text);
          doc.text('Notes:', margin, currentY);
          currentY += 16;
          doc.fontSize(10).font('Helvetica').fillColor(colors.text); // Use dark text color

          // Render notes text
          doc.text(templateSettings.defaultNotes, margin, currentY, {
            width: contentWidth,
          });
          // Estimate height: approximately 12pt per line for 10px font
          const notesLines = Math.ceil(
            templateSettings.defaultNotes.length / 80,
          ); // Rough estimate
          currentY += Math.max(notesLines * 12, 20) + 20;
        }

        // ============================================================================
        // TERMS & CONDITIONS - Display terms if provided
        // ============================================================================
        if (
          templateSettings.showTermsAndConditions &&
          templateSettings.termsAndConditions &&
          templateSettings.termsAndConditions.trim().length > 0
        ) {
          // Check if we need a new page for terms (reserve 120pt for terms + spacing)
          if (currentY > doc.page.height - 200) {
            doc.addPage();
            currentY = margin + 40;
          }
          
          currentY += 10;
          doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.text);
          doc.text('Terms & Conditions:', margin, currentY);
          currentY += 16;
          doc.fontSize(10).font('Helvetica').fillColor(colors.text); // Use dark text color

          // Render terms text
          doc.text(templateSettings.termsAndConditions, margin, currentY, {
            width: contentWidth,
          });
          // Estimate height: approximately 12pt per line for 10px font
          const termsLines = Math.ceil(
            templateSettings.termsAndConditions.length / 80,
          ); // Rough estimate
          currentY += Math.max(termsLines * 12, 20) + 20;
        }

        // ============================================================================
        // BANK DETAILS - Move below terms & conditions (and notes)
        // ============================================================================
        if (
          templateSettings.showBankDetails &&
          organization &&
          (organization.bankAccountNumber ||
            organization.bankIban ||
            organization.bankName ||
            organization.bankAccountHolder)
        ) {
          if (currentY > doc.page.height - 200) {
            doc.addPage();
            currentY = margin + 40;
          }
          currentY += 20;
          doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.text);
          doc.text('Bank Details:', margin, currentY);
          currentY += 16;
          doc.fontSize(10).font('Helvetica').fillColor(colors.text);
          if (organization.bankAccountHolder) {
            doc.text(
              `Account Holder: ${organization.bankAccountHolder}`,
              margin,
              currentY,
            );
            currentY += 14;
          }
          if (organization.bankName) {
            doc.text(`Bank: ${organization.bankName}`, margin, currentY);
            currentY += 14;
          }
          if (organization.bankAccountNumber) {
            doc.text(
              `Account Number: ${organization.bankAccountNumber}`,
              margin,
              currentY,
            );
            currentY += 14;
          }
          if (organization.bankIban) {
            doc.text(`IBAN: ${organization.bankIban}`, margin, currentY);
            currentY += 14;
          }
          if (organization.bankBranch) {
            doc.text(
              `Branch: ${organization.bankBranch}`,
              margin,
              currentY,
            );
            currentY += 14;
          }
          if (organization.bankSwiftCode) {
            doc.text(
              `SWIFT Code: ${organization.bankSwiftCode}`,
              margin,
              currentY,
            );
            currentY += 14;
          }
          currentY += 20;
        }

        // ============================================================================
        // AUTHORISED SIGNATORY + FOOTER - bottom of page
        // ============================================================================
        // Reserve space for signatory + footer (at least 120pt from bottom)
        const footerReservedSpace = 120;
        let footerY = Math.max(
          currentY + 40,
          doc.page.height - footerReservedSpace,
        );

        // If footer would be too close to content, add a new page
        if (currentY > doc.page.height - footerReservedSpace - 20) {
          doc.addPage();
          footerY = doc.page.height - footerReservedSpace;
        }

        // Signatory block on the right
        const signatoryBlockWidth = 220;
        const signatoryX = margin + contentWidth - signatoryBlockWidth;
        const signatoryY = footerY;

        doc.fontSize(9).font('Helvetica-Bold').fillColor(colors.text);
        doc.text(
          `For ${organization?.name || 'the Company'}`,
          signatoryX,
          signatoryY,
          { width: signatoryBlockWidth, align: 'right' },
        );

        // Signature line
        const lineY = signatoryY + 28;
        doc
          .moveTo(signatoryX, lineY)
          .lineTo(signatoryX + signatoryBlockWidth, lineY)
          .strokeColor(colors.border)
          .lineWidth(0.8)
          .stroke();

        // Label
        doc.fontSize(8).font('Helvetica-Bold').fillColor(colors.textMuted);
        doc.text('Authorised Signatory', signatoryX, lineY + 4, {
          width: signatoryBlockWidth,
          align: 'right',
        });

        // Footer separator line across bottom
        const footerLineY = doc.page.height - 60;
        doc.strokeColor(colors.border).lineWidth(0.5);
        doc
          .moveTo(margin, footerLineY)
          .lineTo(margin + contentWidth, footerLineY)
          .stroke();

        let footerTextY = footerLineY + 8;

        // Payment methods if enabled - use dark text color
        if (templateSettings.showPaymentMethods) {
          doc.fontSize(9).font('Helvetica').fillColor(colors.text);
          const paymentMethodsText =
            'Payment Methods: Bank Transfer, Cash, Credit Card';
          doc.text(paymentMethodsText, margin, footerTextY, {
            align: 'center',
            width: contentWidth,
          });
          footerTextY += 14;
        }

        // Footer text - show custom footer text or default message
        if (templateSettings.showFooter) {
          const footerText =
            templateSettings.footerText &&
            templateSettings.footerText.trim().length > 0
              ? templateSettings.footerText
              : 'This is a Computer Generated Invoice';
          doc.fontSize(8).font('Helvetica').fillColor(colors.textMuted);
          doc.text(footerText, margin, footerTextY, {
            align: 'center',
            width: contentWidth,
          });
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate professional Purchase Order PDF
   * Similar design to invoice PDF but adapted for purchase orders
   */
  private async generatePurchaseOrderPDF(reportData: ReportData): Promise<Buffer> {
    const metadata = reportData.metadata || {};
    const invoiceTemplate = (metadata as any).invoiceTemplate || {};
    const logoUrl = invoiceTemplate.logoUrl || metadata.logoUrl;
    let logoBuffer: Buffer | null =
      invoiceTemplate.logoBuffer || (metadata as any).logoBuffer || null;
    const showBankDetails: boolean = invoiceTemplate.showBankDetails ?? false;
    const showCompanyDetails: boolean =
      invoiceTemplate.showCompanyDetails ?? true;
    const showFooter: boolean = invoiceTemplate.showFooter ?? true;
    const footerText: string | undefined = invoiceTemplate.footerText;
    const headerText: string | undefined = invoiceTemplate.headerText;
    const colorScheme: string = invoiceTemplate.colorScheme || 'blue';
    const customColor: string | undefined = invoiceTemplate.customColor;

    if (
      !logoBuffer &&
      logoUrl &&
      (logoUrl.startsWith('http://') || logoUrl.startsWith('https://'))
    ) {
      logoBuffer = await this.fetchImageAsBuffer(logoUrl);
    }

    return new Promise((resolve, reject) => {
      try {
        const po = reportData.data;
        const organization = po.organization;
        const vendor = po.vendor;
        const currency = metadata.currency || po.currency || 'AED';

        const doc = new PDFDocument({
          margin: 56,
          size: 'A4',
          layout: 'portrait',
        });

        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        const pageWidth = doc.page.width;
        const margin = 56;
        const contentWidth = pageWidth - 2 * margin;

        const getColorScheme = () => {
          if (colorScheme === 'custom' && customColor) return customColor;
          const colorMap: Record<string, string> = {
            blue: '#1976d2',
            green: '#2e7d32',
            purple: '#7b1fa2',
            orange: '#f57c00',
            red: '#d32f2f',
          };
          return colorMap[colorScheme] || colorMap.blue;
        };

        const colors = {
          primary: getColorScheme(),
          text: '#0f172a',
          textLight: '#475569',
          textMuted: '#94a3b8',
          border: '#e2e8f0',
          background: '#ffffff',
          backgroundLight: '#f8fafc',
          backgroundDark: '#0f172a',
        };

        const formatAmount = (value: number | string): string => {
          const numValue =
            typeof value === 'string' ? parseFloat(value) : value;
          if (isNaN(numValue)) return '0.00';
          return numValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        };

        // Top border bar
        doc.fillColor(colors.primary).rect(0, 0, pageWidth, 6).fill();

        // Header: Logo and Title (invoice-like)
        let currentY = 40;
        let logoHeight = 0;

        if (logoBuffer) {
          try {
            const bufferStart = logoBuffer.slice(0, 100).toString('utf-8').toLowerCase();
            if (!bufferStart.includes('<svg') && !bufferStart.includes('<?xml')) {
              const logoSize = 140;
              const logoX = margin;
              const logoY = currentY;
              logoHeight = logoSize;
              doc.image(logoBuffer, logoX, logoY, {
                width: logoSize,
                height: logoSize,
                fit: [logoSize, logoSize],
              });
            }
          } catch (error) {
            console.warn('Failed to load PO logo:', error);
          }
        }

        // Purchase Order Title - Right aligned
        doc.fontSize(32).font('Helvetica-Bold').fillColor(colors.primary);
        const titleText = 'PURCHASE ORDER';
        const titleWidth = doc.widthOfString(titleText);
        doc.text(titleText, pageWidth - margin - titleWidth, currentY);

        // Header text (like invoice header text) below title
        if (headerText && headerText.trim().length > 0) {
          doc.fontSize(12).font('Helvetica').fillColor(colors.textLight);
          const headerTextWidth = doc.widthOfString(headerText);
          doc.text(
            headerText,
            pageWidth - margin - headerTextWidth,
            currentY + 38,
          );
        }

        currentY = Math.max(currentY + logoHeight, currentY + 60) + 30;

        // Company Details (Left)
        if (showCompanyDetails && organization) {
          doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.text);
          doc.text(organization.name || 'Company Name', margin, currentY);
          currentY += 16;

          doc.fontSize(9).font('Helvetica').fillColor(colors.textLight);
          if (organization.address) {
            doc.text(organization.address, margin, currentY, {
              width: contentWidth / 2 - 20,
            });
            currentY += 12;
          }
          if (organization.phone) {
            doc.text(`Phone: ${organization.phone}`, margin, currentY);
            currentY += 12;
          }
          if (organization.contactEmail) {
            doc.text(`Email: ${organization.contactEmail}`, margin, currentY);
            currentY += 12;
          }
          if (organization.vatNumber) {
            doc.text(`VAT: ${organization.vatNumber}`, margin, currentY);
            currentY += 12;
          }
        }

        // PO Details (Right) - use fixed label width so "Expected Delivery:" doesn't overlap value
        const rightX = pageWidth - margin - contentWidth / 2;
        const rightLabelWidth = 105; // fits "Expected Delivery:" without overlap
        currentY = Math.max(currentY, 100);
        doc.fontSize(9).font('Helvetica').fillColor(colors.textLight);
        doc.text('PO Number:', rightX, currentY, { width: rightLabelWidth });
        doc.font('Helvetica-Bold').fillColor(colors.text);
        doc.text(po.poNumber || 'N/A', rightX + rightLabelWidth, currentY);
        currentY += 16;

        doc.font('Helvetica').fillColor(colors.textLight);
        doc.text('PO Date:', rightX, currentY, { width: rightLabelWidth });
        doc.font('Helvetica-Bold').fillColor(colors.text);
        const poDate = po.poDate ? new Date(po.poDate).toLocaleDateString() : 'N/A';
        doc.text(poDate, rightX + rightLabelWidth, currentY);
        currentY += 16;

        if (po.expectedDeliveryDate) {
          doc.font('Helvetica').fillColor(colors.textLight);
          doc.text('Expected Delivery:', rightX, currentY, { width: rightLabelWidth });
          doc.font('Helvetica-Bold').fillColor(colors.text);
          const deliveryDate = new Date(po.expectedDeliveryDate).toLocaleDateString();
          doc.text(deliveryDate, rightX + rightLabelWidth, currentY);
          currentY += 16;
        }

        doc.font('Helvetica').fillColor(colors.textLight);
        doc.text('Status:', rightX, currentY, { width: rightLabelWidth });
        doc.font('Helvetica-Bold').fillColor(colors.text);
        const statusMap: Record<string, string> = {
          'draft': 'Draft',
          'sent': 'Sent',
          'acknowledged': 'Acknowledged',
          'partially_received': 'Partially Received',
          'fully_received': 'Fully Received',
          'invoiced': 'Invoiced',
          'closed': 'Closed',
          'cancelled': 'Cancelled',
        };
        doc.text(statusMap[po.status] || po.status, rightX + rightLabelWidth, currentY);
        currentY += 30;

        // Vendor Details Section
        doc.fontSize(11).font('Helvetica-Bold').fillColor(colors.text);
        doc.text('Vendor Details', margin, currentY);
        currentY += 20;

        doc.fontSize(9).font('Helvetica').fillColor(colors.textLight);
        const vendorName = vendor?.name || po.vendorName || 'N/A';
        doc.text(`Name: ${vendorName}`, margin, currentY);
        currentY += 14;

        if (vendor?.address || po.vendor?.address) {
          doc.text(`Address: ${vendor?.address || po.vendor?.address || ''}`, margin, currentY, {
            width: contentWidth / 2,
          });
          currentY += 12;
        }

        if (vendor?.phone || po.vendor?.phone) {
          doc.text(`Phone: ${vendor?.phone || po.vendor?.phone || ''}`, margin, currentY);
          currentY += 14;
        }

        if (vendor?.email || po.vendor?.email) {
          doc.text(`Email: ${vendor?.email || po.vendor?.email || ''}`, margin, currentY);
          currentY += 14;
        }

        if (vendor?.vendorTrn || po.vendorTrn) {
          doc.text(`TRN: ${vendor?.vendorTrn || po.vendorTrn || ''}`, margin, currentY);
          currentY += 20;
        }

        // Line Items Table - invoice-like styling
        currentY += 10;
        const rowHeight = 30;
        const headerHeight = 35;
        const tablePadding = 10;
        const col = {
          item: 98,
          description: 82,
          qty: 38,
          unitPrice: 64,
          amount: 64,
          vat: 54,
          total: 54,
        };
        // Table Header
        doc
          .fillColor(colors.backgroundDark)
          .rect(margin, currentY, contentWidth, headerHeight)
          .fill();
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff');

        let headerX = margin + tablePadding;
        doc.text('Item', headerX, currentY + 12, { width: col.item - 4 });
        headerX += col.item;
        doc.text('Description', headerX, currentY + 12, { width: col.description - 4 });
        headerX += col.description;
        doc.text('Qty', headerX, currentY + 12, { align: 'right', width: col.qty });
        headerX += col.qty;
        doc.text('Unit Price', headerX, currentY + 12, { align: 'right', width: col.unitPrice });
        headerX += col.unitPrice;
        doc.text('Amount', headerX, currentY + 12, { align: 'right', width: col.amount });
        headerX += col.amount;
        doc.text('VAT', headerX, currentY + 12, { align: 'right', width: col.vat });
        headerX += col.vat;
        doc.text('Total', headerX, currentY + 12, { align: 'right', width: col.total });

        currentY += headerHeight;

        // Table Rows
        doc.fontSize(9).font('Helvetica').fillColor(colors.text);
        const lineItems = po.lineItems || [];

        lineItems.forEach((item: any, index: number) => {
          if (currentY > doc.page.height - 100) {
            doc.addPage();
            currentY = margin + 40;
          }

          const bgColor = index % 2 === 0 ? colors.background : '#f8fafc';
          doc.fillColor(bgColor).rect(margin, currentY, contentWidth, rowHeight).fill();

          let cellX = margin + tablePadding;
          doc.fillColor(colors.text);
          doc.text(item.itemName || 'N/A', cellX, currentY + 10, { width: col.item - 4 });
          cellX += col.item;
          doc.text(item.description || '—', cellX, currentY + 10, { width: col.description - 4 });
          cellX += col.description;
          doc.text(
            `${formatAmount(item.orderedQuantity || 0)} ${item.unitOfMeasure || 'unit'}`,
            cellX,
            currentY + 10,
            { align: 'right', width: col.qty },
          );
          cellX += col.qty;
          doc.text(formatAmount(item.unitPrice || 0), cellX, currentY + 10, {
            align: 'right',
            width: col.unitPrice,
          });
          cellX += col.unitPrice;
          doc.text(formatAmount(item.amount || 0), cellX, currentY + 10, {
            align: 'right',
            width: col.amount,
          });
          cellX += col.amount;
          doc.text(formatAmount(item.vatAmount || 0), cellX, currentY + 10, {
            align: 'right',
            width: col.vat,
          });
          cellX += col.vat;
          doc.font('Helvetica-Bold');
          doc.text(formatAmount(item.totalAmount || 0), cellX, currentY + 10, {
            align: 'right',
            width: col.total,
          });
          doc.font('Helvetica');

          currentY += rowHeight;
        });

        // Totals Section (invoice-like totals box)
        currentY += 20;
        const totalsBoxWidth = 240;
        const totalsBoxX = pageWidth - margin - totalsBoxWidth;
        const totalsBoxY = currentY;

        let subtotal = 0;
        let totalVat = 0;
        lineItems.forEach((item: any) => {
          subtotal += parseFloat(item.amount || '0');
          totalVat += parseFloat(item.vatAmount || '0');
        });
        const totalAmount = parseFloat(po.totalAmount || '0');

        const totalsBoxHeight = 92;
        doc
          .fillColor(colors.backgroundLight)
          .roundedRect(totalsBoxX, totalsBoxY, totalsBoxWidth, totalsBoxHeight, 10)
          .fill();
        doc
          .lineWidth(1)
          .strokeColor(colors.border)
          .roundedRect(totalsBoxX, totalsBoxY, totalsBoxWidth, totalsBoxHeight, 10)
          .stroke();

        const totalsX = totalsBoxX + 16;
        let totalsY = totalsBoxY + 14;
        const labelW = 110;
        const valueW = totalsBoxWidth - 32 - labelW;

        doc.fontSize(9).font('Helvetica').fillColor(colors.textLight);
        doc.text('Subtotal', totalsX, totalsY, { width: labelW });
        doc.font('Helvetica-Bold').fillColor(colors.text);
        doc.text(`${formatAmount(subtotal)} ${currency}`, totalsX + labelW, totalsY, {
          width: valueW,
          align: 'right',
        });
        totalsY += 18;

        doc.font('Helvetica').fillColor(colors.textLight);
        doc.text('VAT', totalsX, totalsY, { width: labelW });
        doc.font('Helvetica-Bold').fillColor(colors.text);
        doc.text(`${formatAmount(totalVat)} ${currency}`, totalsX + labelW, totalsY, {
          width: valueW,
          align: 'right',
        });
        totalsY += 20;

        doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.primary);
        doc.text('Total', totalsX, totalsY, { width: labelW });
        doc.fontSize(12).font('Helvetica-Bold').fillColor(colors.primary);
        doc.text(`${formatAmount(totalAmount)} ${currency}`, totalsX + labelW, totalsY - 2, {
          width: valueW,
          align: 'right',
        });

        currentY = totalsBoxY + totalsBoxHeight + 10;

        // Bank Details (reuse invoice logic & gating)
        if (
          showBankDetails &&
          organization &&
          (organization.bankAccountNumber ||
            organization.bankIban ||
            organization.bankName ||
            organization.bankAccountHolder)
        ) {
          currentY += 40;
          if (currentY > doc.page.height - 200) {
            doc.addPage();
            currentY = margin + 40;
          }

          doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.text);
          doc.text('Bank Details:', margin, currentY);
          currentY += 16;

          doc.fontSize(10).font('Helvetica').fillColor(colors.text);
          if (organization.bankAccountHolder) {
            doc.text(
              `Account Holder: ${organization.bankAccountHolder}`,
              margin,
              currentY,
            );
            currentY += 14;
          }
          if (organization.bankName) {
            doc.text(`Bank: ${organization.bankName}`, margin, currentY);
            currentY += 14;
          }
          if (organization.bankAccountNumber) {
            doc.text(
              `Account Number: ${organization.bankAccountNumber}`,
              margin,
              currentY,
            );
            currentY += 14;
          }
          if (organization.bankIban) {
            doc.text(`IBAN: ${organization.bankIban}`, margin, currentY);
            currentY += 14;
          }
          if (organization.bankBranch) {
            doc.text(`Branch: ${organization.bankBranch}`, margin, currentY);
            currentY += 14;
          }
        }

        // Notes Section
        if (po.notes) {
          currentY += 40;
          if (currentY > doc.page.height - 100) {
            doc.addPage();
            currentY = margin + 40;
          }

          doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.text);
          doc.text('Notes:', margin, currentY);
          currentY += 16;
          doc.fontSize(9).font('Helvetica').fillColor(colors.textLight);
          doc.text(po.notes, margin, currentY, { width: contentWidth });
        }

        // Footer
        if (showFooter) {
          const footerY = doc.page.height - 40;
          doc.fontSize(8).font('Helvetica').fillColor(colors.textMuted);
          const effectiveFooter =
            footerText && footerText.trim().length > 0
              ? footerText
              : `Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
          doc.text(effectiveFooter, margin, footerY, {
            align: 'center',
            width: contentWidth,
          });
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
