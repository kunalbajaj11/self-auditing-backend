"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportGeneratorService = void 0;
const common_1 = require("@nestjs/common");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");
let ReportGeneratorService = class ReportGeneratorService {
    formatCurrency(value, currency = 'AED') {
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        if (isNaN(numValue))
            return `${currency} 0.00`;
        return `${currency} ${numValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    }
    formatDate(dateString) {
        if (!dateString)
            return '';
        const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
        return date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    }
    async generatePDF(reportData) {
        return new Promise((resolve, reject) => {
            try {
                const useLandscape = this.shouldUseLandscape(reportData.type);
                const doc = new PDFDocument({
                    margin: 50,
                    size: 'A4',
                    layout: useLandscape ? 'landscape' : 'portrait',
                });
                const buffers = [];
                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => {
                    const pdfBuffer = Buffer.concat(buffers);
                    resolve(pdfBuffer);
                });
                doc.on('error', reject);
                this.addPDFHeader(doc, reportData);
                doc.moveDown(0.5);
                doc
                    .fontSize(18)
                    .font('Helvetica-Bold')
                    .text(this.getReportTitle(reportData.type), { align: 'center' });
                doc.moveDown(0.3);
                if (reportData.metadata?.reportPeriod?.startDate ||
                    reportData.metadata?.reportPeriod?.endDate) {
                    const period = `${this.formatDate(reportData.metadata.reportPeriod.startDate || '')} to ${this.formatDate(reportData.metadata.reportPeriod.endDate || '')}`;
                    doc
                        .fontSize(12)
                        .font('Helvetica')
                        .text(`Period: ${period}`, { align: 'center' });
                }
                doc.moveDown(0.5);
                if (reportData.metadata?.summary) {
                    this.addPDFSummary(doc, reportData);
                    doc.moveDown(0.5);
                }
                this.addPDFContent(doc, reportData);
                const pageRange = doc.bufferedPageRange();
                const startPage = pageRange.start;
                const pageCount = pageRange.count;
                for (let i = 0; i < pageCount; i++) {
                    doc.switchToPage(startPage + i);
                    this.addPDFFooter(doc, reportData, i + 1, pageCount);
                }
                doc.end();
            }
            catch (error) {
                reject(error);
            }
        });
    }
    shouldUseLandscape(reportType) {
        const landscapeReports = [
            'expense_detail',
            'expense_summary',
            'bank_reconciliation',
            'trial_balance',
        ];
        return landscapeReports.includes(reportType);
    }
    getReportTitle(reportType) {
        const titles = {
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
        return (titles[reportType] ||
            reportType.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()));
    }
    addPDFHeader(doc, reportData) {
        const pageWidth = doc.page.width;
        const margin = 50;
        const headerBgColor = '#f3f6fa';
        const headerHeight = 120;
        doc
            .rect(margin, 30, pageWidth - 2 * margin, headerHeight)
            .fillColor(headerBgColor)
            .fill();
        const logoSize = 60;
        const logoX = margin + 10;
        const logoY = 40;
        const getApplicationLogoPath = () => {
            const possiblePaths = [
                path.join(process.cwd(), 'assets', 'images', 'app-logo.jpg'),
                path.join(__dirname, '..', '..', '..', 'assets', 'images', 'app-logo.jpg'),
                path.join(__dirname, '..', '..', 'assets', 'images', 'app-logo.jpg'),
            ];
            for (const logoPath of possiblePaths) {
                if (fs.existsSync(logoPath)) {
                    return logoPath;
                }
            }
            return null;
        };
        const logoToUse = reportData.metadata?.logoUrl || getApplicationLogoPath();
        if (logoToUse) {
            try {
                const logoUrl = logoToUse;
                if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
                    doc.image(logoUrl, logoX, logoY, {
                        width: logoSize,
                        height: logoSize,
                        fit: [logoSize, logoSize],
                    });
                }
                else if (fs.existsSync(logoUrl)) {
                    doc.image(logoUrl, logoX, logoY, {
                        width: logoSize,
                        height: logoSize,
                        fit: [logoSize, logoSize],
                    });
                }
                else {
                    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a8a');
                    doc.text('selfAccounting.AI', logoX, logoY, { width: logoSize });
                }
            }
            catch (error) {
                console.warn('Failed to load logo:', error);
                doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a8a');
                doc.text('selfAccounting.AI', logoX, logoY, { width: logoSize });
            }
        }
        else {
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a8a');
            doc.text('selfAccounting.AI', logoX, logoY, { width: logoSize });
        }
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#1e3a8a');
        const orgName = reportData.metadata?.organizationName || 'SmartExpense UAE';
        const leftTextX = logoX + logoSize + 12;
        doc.text(orgName, leftTextX, 40, {
            width: pageWidth / 2 - (leftTextX - margin) - 20,
        });
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
        const rightX = pageWidth / 2 + 20;
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e3a8a');
        doc.text(this.getReportTitle(reportData.type), rightX, 40, {
            width: pageWidth - rightX - margin,
            align: 'right',
        });
        doc.fontSize(9).font('Helvetica').fillColor('#333');
        yPos = 60;
        if (reportData.metadata?.reportPeriod?.startDate ||
            reportData.metadata?.reportPeriod?.endDate) {
            const period = `Period: ${this.formatDate(reportData.metadata.reportPeriod.startDate || '')} to ${this.formatDate(reportData.metadata.reportPeriod.endDate || '')}`;
            doc.text(period, rightX, yPos, {
                width: pageWidth - rightX - margin,
                align: 'right',
            });
            yPos += 12;
        }
        if (reportData.metadata?.organizationId) {
            doc.text(`Org ID: ${reportData.metadata.organizationId.substring(0, 8)}`, rightX, yPos, { width: pageWidth - rightX - margin, align: 'right' });
            yPos += 12;
        }
        doc.text(`Currency: ${reportData.metadata?.currency || 'AED'}`, rightX, yPos, { width: pageWidth - rightX - margin, align: 'right' });
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
            doc.text(`Generated by: ${reportData.metadata.generatedByName}`, rightX, yPos, { width: pageWidth - rightX - margin, align: 'right' });
        }
        if (reportData.metadata?.filters &&
            Object.keys(reportData.metadata.filters).length > 0) {
            yPos += 12;
            const filtersText = `Filters: ${Object.entries(reportData.metadata.filters)
                .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                .join('; ')}`;
            doc.fontSize(8).fillColor('#666');
            doc.text(filtersText, rightX, yPos, {
                width: pageWidth - rightX - margin,
                align: 'right',
            });
        }
        doc
            .moveTo(margin, 30 + headerHeight + 5)
            .lineTo(pageWidth - margin, 30 + headerHeight + 5)
            .strokeColor('#d0d7de')
            .lineWidth(1)
            .stroke();
        doc.fillColor('black');
        doc.y = 30 + headerHeight + 15;
    }
    addPDFSummary(doc, reportData) {
        const summary = reportData.metadata?.summary;
        if (!summary)
            return;
        const pageWidth = doc.page.width;
        const margin = 50;
        const currency = reportData.metadata?.currency || 'AED';
        const period = reportData.metadata?.reportPeriod
            ? `${this.formatDate(reportData.metadata.reportPeriod.startDate || '')} to ${this.formatDate(reportData.metadata.reportPeriod.endDate || '')}`
            : 'All Time';
        const summaryStartY = doc.y;
        const summaryHeight = 180;
        doc
            .rect(margin, summaryStartY, pageWidth - 2 * margin, summaryHeight)
            .fillColor('#f9fafb')
            .fill()
            .strokeColor('#d0d7de')
            .lineWidth(1)
            .stroke();
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e3a8a');
        doc.text(`Summary (Period: ${period})`, margin + 10, summaryStartY + 10);
        const leftX = margin + 10;
        const rightX = pageWidth / 2 + 10;
        let yPos = summaryStartY + 35;
        doc.fontSize(10).font('Helvetica').fillColor('#333');
        if (summary.totalExpenses !== undefined) {
            doc.text(`Total Number of Expenses: ${summary.totalExpenses}`, leftX, yPos);
            yPos += 15;
        }
        if (summary.totalAmountBeforeVat !== undefined) {
            doc.text(`Total Amount (Before VAT): ${this.formatCurrency(summary.totalAmountBeforeVat, currency)}`, leftX, yPos);
            yPos += 15;
        }
        if (summary.totalVatAmount !== undefined) {
            doc.text(`Total VAT Amount: ${this.formatCurrency(summary.totalVatAmount, currency)}`, leftX, yPos);
            yPos += 15;
        }
        if (summary.totalAmountAfterVat !== undefined) {
            doc.font('Helvetica-Bold');
            doc.text(`Total Amount (After VAT): ${this.formatCurrency(summary.totalAmountAfterVat, currency)}`, leftX, yPos);
            doc.font('Helvetica');
            yPos += 15;
        }
        if (summary.averageExpenseAmount !== undefined) {
            doc.text(`Average Expense Amount: ${this.formatCurrency(summary.averageExpenseAmount, currency)}`, leftX, yPos);
            yPos += 15;
        }
        yPos = summaryStartY + 35;
        if (summary.highestCategorySpend) {
            doc.text(`Highest Category Spend: ${summary.highestCategorySpend.category} (${this.formatCurrency(summary.highestCategorySpend.amount, currency)})`, rightX, yPos);
            yPos += 15;
        }
        if (summary.topVendor) {
            doc.text(`Top Vendor: ${summary.topVendor.vendor} (${this.formatCurrency(summary.topVendor.amount, currency)})`, rightX, yPos);
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
            doc.text(`User with Highest Upload Count: ${summary.userWithHighestUploadCount.user} (${summary.userWithHighestUploadCount.count} uploads)`, rightX, yPos);
        }
        doc.fillColor('black');
        doc.y = summaryStartY + summaryHeight + 10;
    }
    addPDFFooter(doc, reportData, pageNumber, totalPages) {
        const pageHeight = doc.page.height;
        const pageWidth = doc.page.width;
        const margin = 50;
        const footerY = pageHeight - 35;
        doc
            .moveTo(margin, footerY - 5)
            .lineTo(pageWidth - margin, footerY - 5)
            .strokeColor('#e0e0e0')
            .lineWidth(0.5)
            .stroke();
        doc.fontSize(8).font('Helvetica').fillColor('#666');
        const disclaimer = 'This is a system-generated report, no signature required.';
        doc.text(disclaimer, margin, footerY, {
            align: 'left',
        });
        doc.text('Generated by SelfAccounting.AI', margin, footerY + 10, {
            align: 'left',
        });
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
        doc.fillColor('black');
    }
    async generateXLSX(reportData) {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'SmartExpense UAE';
        workbook.created = new Date();
        const currency = reportData.metadata?.currency || 'AED';
        const summarySheet = workbook.addWorksheet('Summary');
        this.addXLSXHeader(summarySheet, reportData);
        if (reportData.type === 'vat_report' &&
            typeof reportData.data === 'object') {
            this.addXLSXVATReport(workbook, reportData, currency);
        }
        else if (reportData.type === 'bank_reconciliation' &&
            typeof reportData.data === 'object') {
            this.addXLSXBankReconciliation(workbook, reportData, currency);
        }
        else if (reportData.type === 'trial_balance' &&
            typeof reportData.data === 'object') {
            this.addXLSXTrialBalance(workbook, reportData, currency);
        }
        else if ((reportData.type === 'expense_summary' ||
            reportData.type === 'expense_detail') &&
            Array.isArray(reportData.data)) {
            this.addXLSXExpenseReport(workbook, reportData, currency);
        }
        else {
            this.addXLSXContent(summarySheet, reportData, currency);
        }
        const buffer = await workbook.xlsx.writeBuffer();
        return Buffer.from(buffer);
    }
    addXLSXExpenseReport(workbook, reportData, currency) {
        const data = reportData.data;
        if (!data || data.length === 0) {
            let sheet = workbook.getWorksheet('Summary');
            if (!sheet) {
                sheet = workbook.addWorksheet('Summary');
            }
            this.addXLSXHeader(sheet, reportData);
            sheet.addRow(['No data available.']);
            return;
        }
        const expenseSheet = workbook.getWorksheet('Summary') || workbook.addWorksheet('Summary');
        this.addXLSXHeader(expenseSheet, reportData);
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
        data.forEach((row, index) => {
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
                    const numValue = typeof value === 'string' ? parseFloat(value) : value;
                    return isNaN(numValue) ? 0 : numValue;
                }
                return value ?? '';
            });
            const dataRow = expenseSheet.addRow(values);
            if (index % 2 === 0) {
                dataRow.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF9FAFB' },
                };
            }
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
                if (currencyFields.some((field) => header.toLowerCase().includes(field))) {
                    cell.numFmt = `"${currency}" #,##0.00`;
                    cell.alignment = { horizontal: 'right' };
                }
                else if (header.toLowerCase().includes('date')) {
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
        expenseSheet.views = [
            {
                state: 'frozen',
                ySplit: expenseSheet.rowCount - data.length,
            },
        ];
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
        const vatColIndex = headers.findIndex((h) => h.toLowerCase().includes('vat'));
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
        expenseSheet.columns.forEach((column, index) => {
            if (column.header) {
                const headerLength = formattedHeaders[index]?.length || 10;
                column.width = Math.max(headerLength + 2, 12);
            }
        });
        this.addXLSXPivotSheets(workbook, data, currency);
    }
    addXLSXPivotSheets(workbook, data, currency) {
        const categorySheet = workbook.addWorksheet('Category Summary');
        categorySheet.addRow(['Category', 'Count', 'Amount', 'VAT', 'Total']);
        const categoryHeaderRow = categorySheet.getRow(1);
        categoryHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        categoryHeaderRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1e3a8a' },
        };
        const categoryMap = new Map();
        data.forEach((row) => {
            const category = row.category || 'Uncategorized';
            const amount = row.amount || row.baseAmount || 0;
            const vat = row.vat || row.vatAmount || 0;
            const total = row.total || row.totalAmount || 0;
            if (!categoryMap.has(category)) {
                categoryMap.set(category, { count: 0, amount: 0, vat: 0, total: 0 });
            }
            const cat = categoryMap.get(category);
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
        ['C', 'D', 'E'].forEach((col) => {
            categorySheet.getColumn(col).numFmt = `"${currency}" #,##0.00`;
            categorySheet.getColumn(col).alignment = { horizontal: 'right' };
        });
        const vendorSheet = workbook.addWorksheet('Vendor Summary');
        vendorSheet.addRow(['Vendor', 'Count', 'Amount', 'VAT', 'Total']);
        const vendorHeaderRow = vendorSheet.getRow(1);
        vendorHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        vendorHeaderRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1e3a8a' },
        };
        const vendorMap = new Map();
        data.forEach((row) => {
            const vendor = row.vendor || 'N/A';
            const amount = row.amount || row.baseAmount || 0;
            const vat = row.vat || row.vatAmount || 0;
            const total = row.total || row.totalAmount || 0;
            if (!vendorMap.has(vendor)) {
                vendorMap.set(vendor, { count: 0, amount: 0, vat: 0, total: 0 });
            }
            const ven = vendorMap.get(vendor);
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
        ['C', 'D', 'E'].forEach((col) => {
            vendorSheet.getColumn(col).numFmt = `"${currency}" #,##0.00`;
            vendorSheet.getColumn(col).alignment = { horizontal: 'right' };
        });
        const monthlySheet = workbook.addWorksheet('Monthly Breakdown');
        monthlySheet.addRow(['Month', 'Total Spend', 'VAT']);
        const monthlyHeaderRow = monthlySheet.getRow(1);
        monthlyHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        monthlyHeaderRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1e3a8a' },
        };
        const monthlyMap = new Map();
        data.forEach((row) => {
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
                const mon = monthlyMap.get(month);
                mon.spend += total;
                mon.vat += vat;
            }
        });
        const sortedMonths = Array.from(monthlyMap.entries()).sort((a, b) => {
            return new Date(a[0]).getTime() - new Date(b[0]).getTime();
        });
        sortedMonths.forEach(([month, value]) => {
            monthlySheet.addRow([month, value.spend, value.vat]);
        });
        ['B', 'C'].forEach((col) => {
            monthlySheet.getColumn(col).numFmt = `"${currency}" #,##0.00`;
            monthlySheet.getColumn(col).alignment = { horizontal: 'right' };
        });
        [categorySheet, vendorSheet, monthlySheet].forEach((sheet) => {
            sheet.columns.forEach((column) => {
                if (column.header) {
                    column.width = Math.max(15, column.header.length + 2);
                }
            });
        });
    }
    async generateCSV(reportData) {
        const lines = [];
        lines.push(reportData.metadata?.organizationName || 'SmartExpense UAE');
        lines.push(this.getReportTitle(reportData.type));
        if (reportData.metadata?.reportPeriod?.startDate ||
            reportData.metadata?.reportPeriod?.endDate) {
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
        this.addCSVContent(lines, reportData);
        return Buffer.from(lines.join('\n'), 'utf-8');
    }
    addPDFContent(doc, reportData) {
        const data = reportData.data;
        const currency = reportData.metadata?.currency || 'AED';
        if (Array.isArray(data)) {
            if (data.length === 0) {
                doc
                    .fontSize(12)
                    .font('Helvetica')
                    .text('No data available.', { align: 'center' });
                return;
            }
            const headers = this.getColumnsForReport(reportData.type, data[0]);
            const pageWidth = doc.page.width;
            const margin = 50;
            const availableWidth = pageWidth - 2 * margin;
            const colWidth = availableWidth / headers.length;
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
            let rowY = headerY + 25;
            data.forEach((row, index) => {
                if (rowY > doc.page.height - 80) {
                    doc.addPage();
                    this.addPDFHeader(doc, reportData);
                    rowY = doc.y;
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
        }
        else if (typeof data === 'object' && data !== null) {
            this.addPDFStructuredContent(doc, reportData, data, currency);
        }
        else {
            doc.fontSize(12).font('Helvetica').text(String(data));
        }
    }
    getColumnsForReport(reportType, sampleRow) {
        const allHeaders = Object.keys(sampleRow || {});
        if (allHeaders.length === 0)
            return allHeaders;
        if (reportType === 'expense_summary' || reportType === 'expense_detail') {
            const filteredHeaders = allHeaders.filter((h) => h.toLowerCase() !== 'notes');
            const normalized = new Set(filteredHeaders.map((h) => h.toLowerCase()));
            const pick = (candidates) => candidates.find((c) => normalized.has(c.toLowerCase()));
            const selected = [];
            const pushIf = (c) => {
                if (c && !selected.includes(c))
                    selected.push(c);
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
            if (selected.length < 4) {
                for (const h of filteredHeaders) {
                    if (selected.length >= 6)
                        break;
                    if (!selected.includes(h))
                        selected.push(h);
                }
            }
            return selected;
        }
        return allHeaders;
    }
    formatHeaderLabel(header) {
        return header
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (str) => str.toUpperCase())
            .trim();
    }
    formatCellValue(value, header, currency) {
        if (value === null || value === undefined)
            return '';
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
        if (header.toLowerCase().includes('date') && value) {
            return this.formatDate(value);
        }
        if (Array.isArray(value)) {
            return value.length > 0 ? `${value.length} item(s)` : 'None';
        }
        return String(value);
    }
    getColumnAlignment(header) {
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
        if (rightAlignFields.some((field) => header.toLowerCase().includes(field))) {
            return 'right';
        }
        if (header.toLowerCase().includes('date') ||
            header.toLowerCase().includes('id')) {
            return 'center';
        }
        return 'left';
    }
    shouldShowTotal(reportType) {
        return [
            'expense_summary',
            'expense_detail',
            'vendor_report',
            'employee_report',
        ].includes(reportType);
    }
    calculateTotalRow(data, headers, currency) {
        const totalRow = {};
        headers.forEach((header) => {
            const currencyFields = [
                'amount',
                'vat',
                'total',
                'totalAmount',
                'vatAmount',
            ];
            if (currencyFields.some((field) => header.toLowerCase().includes(field))) {
                const sum = data.reduce((acc, row) => {
                    const val = typeof row[header] === 'string'
                        ? parseFloat(row[header])
                        : row[header];
                    return acc + (isNaN(val) ? 0 : val);
                }, 0);
                totalRow[header] = this.formatCurrency(sum, currency);
            }
            else if (header.toLowerCase() === 'date' ||
                header.toLowerCase().includes('id')) {
                totalRow[header] = '';
            }
            else {
                totalRow[header] = 'Total';
            }
        });
        return totalRow;
    }
    addPDFStructuredContent(doc, reportData, data, currency) {
        if (reportData.type === 'vat_report') {
            doc
                .fontSize(14)
                .font('Helvetica-Bold')
                .text('VAT Summary', { underline: true });
            doc.moveDown(0.3);
            doc.fontSize(11).font('Helvetica');
            if (data.taxableSupplies !== undefined) {
                doc.text(`Taxable Supplies: ${this.formatCurrency(data.taxableSupplies, currency)}`);
            }
            if (data.inputVat !== undefined) {
                doc.text(`Input VAT: ${this.formatCurrency(data.inputVat, currency)}`);
            }
            if (data.outputVat !== undefined) {
                doc.text(`Output VAT: ${this.formatCurrency(data.outputVat, currency)}`);
            }
            if (data.netVatPayable !== undefined) {
                doc.font('Helvetica-Bold');
                doc.text(`Net VAT Payable: ${this.formatCurrency(data.netVatPayable, currency)}`);
                doc.font('Helvetica');
            }
            if (data.status) {
                doc.text(`Status: ${data.status}`);
            }
            if (data.categoryBreakdown &&
                Array.isArray(data.categoryBreakdown) &&
                data.categoryBreakdown.length > 0) {
                doc.moveDown(0.5);
                doc
                    .fontSize(12)
                    .font('Helvetica-Bold')
                    .text('Category Breakdown', { underline: true });
                doc.moveDown(0.3);
                this.addPDFTable(doc, data.categoryBreakdown, ['category', 'taxableAmount', 'vatAmount', 'totalAmount'], currency);
            }
        }
        else if (reportData.type === 'bank_reconciliation') {
            doc
                .fontSize(14)
                .font('Helvetica-Bold')
                .text('Reconciliation Summary', { underline: true });
            doc.moveDown(0.3);
            doc.fontSize(11).font('Helvetica');
            doc.text(`Reconciliation ID: ${data.reconciliationId || 'N/A'}`);
            doc.text(`Date Range: ${this.formatDate(data.dateRange?.startDate || '')} to ${this.formatDate(data.dateRange?.endDate || '')}`);
            doc.text(`Total Transactions: ${data.totalTransactions || 0}`);
            doc.text(`Matched: ${data.matched || 0}`);
            doc.text(`Unmatched: ${data.unmatched || 0}`);
            doc.font('Helvetica-Bold');
            doc.text(`Variance: ${this.formatCurrency(data.variance || 0, currency)}`);
            doc.font('Helvetica');
            if (data.transactions &&
                Array.isArray(data.transactions) &&
                data.transactions.length > 0) {
                doc.moveDown(0.5);
                doc
                    .fontSize(12)
                    .font('Helvetica-Bold')
                    .text('Transactions', { underline: true });
                doc.moveDown(0.3);
                this.addPDFTable(doc, data.transactions, ['date', 'description', 'amount', 'status'], currency);
            }
        }
        else if (reportData.type === 'trial_balance') {
            doc
                .fontSize(14)
                .font('Helvetica-Bold')
                .text('Trial Balance Summary', { underline: true });
            doc.moveDown(0.3);
            doc.fontSize(11).font('Helvetica');
            if (data.summary) {
                doc.text(`Total Debit: ${this.formatCurrency(data.summary.totalDebit || 0, currency)}`);
                doc.text(`Total Credit: ${this.formatCurrency(data.summary.totalCredit || 0, currency)}`);
                doc.font('Helvetica-Bold');
                doc.text(`Total Balance: ${this.formatCurrency(data.summary.totalBalance || 0, currency)}`);
                doc.font('Helvetica');
            }
            if (data.accounts &&
                Array.isArray(data.accounts) &&
                data.accounts.length > 0) {
                doc.moveDown(0.5);
                doc
                    .fontSize(12)
                    .font('Helvetica-Bold')
                    .text('Accounts', { underline: true });
                doc.moveDown(0.3);
                this.addPDFTable(doc, data.accounts, ['accountName', 'accountType', 'debit', 'credit', 'balance'], currency);
            }
        }
        else {
            Object.entries(data).forEach(([key, value]) => {
                if (typeof value === 'object' &&
                    value !== null &&
                    !Array.isArray(value)) {
                    doc.fontSize(12).font('Helvetica-Bold').text(key);
                    doc.font('Helvetica').fontSize(10);
                    Object.entries(value).forEach(([subKey, subValue]) => {
                        doc.text(`  ${subKey}: ${String(subValue)}`);
                    });
                }
                else {
                    doc.fontSize(11).text(`${key}: ${String(value)}`);
                }
            });
        }
    }
    addPDFTable(doc, data, columns, currency) {
        if (data.length === 0)
            return;
        const pageWidth = doc.page.width;
        const margin = 50;
        const availableWidth = pageWidth - 2 * margin;
        const colWidth = availableWidth / columns.length;
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
        let rowY = headerY + 25;
        data.forEach((row, index) => {
            if (rowY > doc.page.height - 80) {
                doc.addPage();
                this.addPDFHeader(doc, { type: '', data: {}, metadata: {} });
                rowY = doc.y;
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
    addXLSXHeader(worksheet, reportData) {
        worksheet.addRow([
            reportData.metadata?.organizationName || 'SmartExpense UAE',
        ]);
        worksheet.mergeCells(`A1:D1`);
        const headerCell = worksheet.getCell('A1');
        headerCell.font = { size: 16, bold: true, color: { argb: 'FF1e3a8a' } };
        headerCell.alignment = { horizontal: 'left', vertical: 'middle' };
        worksheet.addRow([this.getReportTitle(reportData.type)]);
        worksheet.mergeCells(`A2:D2`);
        const titleCell = worksheet.getCell('A2');
        titleCell.font = { size: 14, bold: true };
        titleCell.alignment = { horizontal: 'left' };
        if (reportData.metadata?.reportPeriod?.startDate ||
            reportData.metadata?.reportPeriod?.endDate) {
            const period = `Period: ${this.formatDate(reportData.metadata.reportPeriod.startDate || '')} to ${this.formatDate(reportData.metadata.reportPeriod.endDate || '')}`;
            worksheet.addRow([period]);
            worksheet.mergeCells(`A3:D3`);
        }
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
        const generatedDate = reportData.metadata?.generatedAt
            ? this.formatDate(reportData.metadata.generatedAt)
            : new Date().toLocaleDateString('en-GB');
        worksheet.addRow([`Generated: ${generatedDate}`]);
        worksheet.mergeCells(`A${rowNum}:D${rowNum}`);
        worksheet.addRow([]);
    }
    addXLSXContent(worksheet, reportData, currency) {
        const data = reportData.data;
        if (Array.isArray(data)) {
            if (data.length === 0) {
                worksheet.addRow(['No data available.']);
                return;
            }
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
            data.forEach((row, index) => {
                const values = headers.map((h) => {
                    const value = row[h];
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
                        const numValue = typeof value === 'string' ? parseFloat(value) : value;
                        return isNaN(numValue) ? 0 : numValue;
                    }
                    return value ?? '';
                });
                const dataRow = worksheet.addRow(values);
                if (index % 2 === 0) {
                    dataRow.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF9FAFB' },
                    };
                }
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
                    if (currencyFields.some((field) => header.toLowerCase().includes(field))) {
                        cell.numFmt = `"${currency}" #,##0.00`;
                        cell.alignment = { horizontal: 'right' };
                    }
                    else if (header.toLowerCase().includes('date')) {
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
                    if (currencyFields.some((field) => header.toLowerCase().includes(field))) {
                        cell.numFmt = `"${currency}" #,##0.00`;
                        cell.alignment = { horizontal: 'right' };
                    }
                });
            }
            worksheet.columns.forEach((column, index) => {
                if (column.header) {
                    const headerLength = formattedHeaders[index]?.length || 10;
                    column.width = Math.max(headerLength + 2, 12);
                }
            });
        }
        else if (typeof data === 'object') {
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
    addXLSXVATReport(workbook, reportData, currency) {
        const data = reportData.data;
        const summarySheet = workbook.getWorksheet('Summary') || workbook.addWorksheet('Summary');
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
        [2, 3, 4, 5].forEach((rowNum) => {
            const cell = summarySheet.getCell(`B${rowNum}`);
            cell.numFmt = `"${currency}" #,##0.00`;
        });
        if (data.categoryBreakdown &&
            Array.isArray(data.categoryBreakdown) &&
            data.categoryBreakdown.length > 0) {
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
            data.categoryBreakdown.forEach((item) => {
                categorySheet.addRow([
                    item.category,
                    item.taxableAmount || 0,
                    item.vatAmount || 0,
                    item.totalAmount || 0,
                ]);
            });
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
    addXLSXBankReconciliation(workbook, reportData, currency) {
        const data = reportData.data;
        const summarySheet = workbook.getWorksheet('Summary') || workbook.addWorksheet('Summary');
        this.addXLSXHeader(summarySheet, reportData);
        summarySheet.addRow(['Reconciliation Summary']);
        summarySheet.addRow(['Reconciliation ID', data.reconciliationId || 'N/A']);
        summarySheet.addRow(['Total Transactions', data.totalTransactions || 0]);
        summarySheet.addRow(['Matched', data.matched || 0]);
        summarySheet.addRow(['Unmatched', data.unmatched || 0]);
        summarySheet.addRow(['Variance', data.variance || 0]);
        const varianceCell = summarySheet.getCell('B6');
        varianceCell.numFmt = `"${currency}" #,##0.00`;
        if (data.transactions &&
            Array.isArray(data.transactions) &&
            data.transactions.length > 0) {
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
            data.transactions.forEach((item) => {
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
                if (col.header)
                    col.width = 18;
            });
        }
    }
    addXLSXTrialBalance(workbook, reportData, currency) {
        const data = reportData.data;
        const summarySheet = workbook.getWorksheet('Summary') || workbook.addWorksheet('Summary');
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
        if (data.accounts &&
            Array.isArray(data.accounts) &&
            data.accounts.length > 0) {
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
            data.accounts.forEach((item) => {
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
    addCSVContent(lines, reportData) {
        const data = reportData.data;
        if (Array.isArray(data)) {
            if (data.length === 0) {
                lines.push('No data available.');
                return;
            }
            const headers = Object.keys(data[0]);
            const formattedHeaders = headers.map((h) => this.formatHeaderLabel(h));
            lines.push(formattedHeaders.join(','));
            data.forEach((row) => {
                const values = headers.map((h) => {
                    let value = row[h];
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
                        const numValue = typeof value === 'string' ? parseFloat(value) : value;
                        value = isNaN(numValue) ? '0.00' : numValue.toFixed(2);
                    }
                    else if (h.toLowerCase().includes('date') && value) {
                        value = this.formatDate(value);
                    }
                    else if (Array.isArray(value)) {
                        value = value.length > 0 ? `${value.length} item(s)` : 'None';
                    }
                    else {
                        value = String(value ?? '');
                    }
                    const valueStr = String(value);
                    return valueStr.includes(',') ||
                        valueStr.includes('"') ||
                        valueStr.includes('\n')
                        ? `"${valueStr.replace(/"/g, '""')}"`
                        : valueStr;
                });
                lines.push(values.join(','));
            });
        }
        else if (typeof data === 'object' && data !== null) {
            if (reportData.type === 'vat_report') {
                lines.push('VAT Summary');
                lines.push(`Taxable Supplies,${data.taxableSupplies || data.taxableAmount || 0}`);
                lines.push(`Input VAT,${data.inputVat || data.vatAmount || 0}`);
                lines.push(`Output VAT,${data.outputVat || 0}`);
                lines.push(`Net VAT Payable,${data.netVatPayable || 0}`);
                lines.push(`Status,${data.status || 'Pending'}`);
                lines.push('');
                if (data.categoryBreakdown &&
                    Array.isArray(data.categoryBreakdown) &&
                    data.categoryBreakdown.length > 0) {
                    lines.push('Category Breakdown');
                    lines.push('Category,Taxable Amount,VAT Amount,Total Amount');
                    data.categoryBreakdown.forEach((item) => {
                        lines.push(`${item.category},${item.taxableAmount || 0},${item.vatAmount || 0},${item.totalAmount || 0}`);
                    });
                }
            }
            else if (reportData.type === 'bank_reconciliation') {
                lines.push('Reconciliation Summary');
                lines.push(`Reconciliation ID,${data.reconciliationId || 'N/A'}`);
                lines.push(`Total Transactions,${data.totalTransactions || 0}`);
                lines.push(`Matched,${data.matched || 0}`);
                lines.push(`Unmatched,${data.unmatched || 0}`);
                lines.push(`Variance,${data.variance || 0}`);
                lines.push('');
                if (data.transactions &&
                    Array.isArray(data.transactions) &&
                    data.transactions.length > 0) {
                    lines.push('Transactions');
                    lines.push('Date,Description,Amount,Status,Linked Expense ID');
                    data.transactions.forEach((item) => {
                        lines.push(`${item.date || ''},${item.description || ''},${item.amount || 0},${item.status || ''},${item.linkedExpenseId || ''}`);
                    });
                }
            }
            else {
                lines.push('Key,Value');
                Object.entries(data).forEach(([key, value]) => {
                    const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
                    const escaped = val.includes(',') || val.includes('"')
                        ? `"${val.replace(/"/g, '""')}"`
                        : val;
                    lines.push(`${key},${escaped}`);
                });
            }
        }
    }
};
exports.ReportGeneratorService = ReportGeneratorService;
exports.ReportGeneratorService = ReportGeneratorService = __decorate([
    (0, common_1.Injectable)()
], ReportGeneratorService);
//# sourceMappingURL=report-generator.service.js.map