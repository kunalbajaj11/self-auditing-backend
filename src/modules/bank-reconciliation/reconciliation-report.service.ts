import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';
import { ReconciliationRecord } from '../../entities/reconciliation-record.entity';
import { BankTransaction } from '../../entities/bank-transaction.entity';
import { SystemTransaction } from '../../entities/system-transaction.entity';
import { ReconciliationStatus } from '../../common/enums/reconciliation-status.enum';
import { TransactionType } from '../../common/enums/transaction-type.enum';

@Injectable()
export class ReconciliationReportService {
  constructor(
    @InjectRepository(ReconciliationRecord)
    private readonly reconciliationRecordsRepository: Repository<ReconciliationRecord>,
    @InjectRepository(BankTransaction)
    private readonly bankTransactionsRepository: Repository<BankTransaction>,
    @InjectRepository(SystemTransaction)
    private readonly systemTransactionsRepository: Repository<SystemTransaction>,
  ) {}

  async generatePDFReport(
    organizationId: string,
    recordId: string,
  ): Promise<Buffer> {
    const record = await this.reconciliationRecordsRepository.findOne({
      where: { id: recordId, organization: { id: organizationId } },
      relations: [
        'organization',
        'createdBy',
        'bankTransactions',
        'systemTransactions',
        'systemTransactions.expense',
      ],
    });

    if (!record) {
      throw new NotFoundException('Reconciliation record not found');
    }

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 50,
          size: 'A4',
          layout: 'landscape',
        });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Header
        doc.fontSize(16).font('Helvetica-Bold');
        doc.text(
          record.organization.name || 'Bank Reconciliation Report',
          50,
          50,
        );

        doc.fontSize(10).font('Helvetica');
        doc.text(
          `Generated: ${new Date().toLocaleDateString('en-GB')}`,
          50,
          70,
        );

        // Report Title
        doc.moveDown(1);
        doc.fontSize(18).font('Helvetica-Bold');
        doc.text('Bank Reconciliation Summary', { align: 'center' });

        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica');
        doc.text(
          `Period: ${this.formatDate(record.statementPeriodStart)} to ${this.formatDate(record.statementPeriodEnd)}`,
          { align: 'center' },
        );

        doc.moveDown(1);

        // Summary Section
        doc.fontSize(14).font('Helvetica-Bold');
        doc.text('Summary', 50);
        doc.moveDown(0.3);

        doc.fontSize(10).font('Helvetica');
        const summaryY = doc.y;
        doc.text(`Total Bank Credits: ${this.formatCurrency(record.totalBankCredits)}`, 50);
        doc.text(`Total Bank Debits: ${this.formatCurrency(record.totalBankDebits)}`, 50);
        doc.text(`Matched Transactions: ${record.totalMatched}`, 50);
        doc.text(`Unmatched Transactions: ${record.totalUnmatched}`, 50);
        doc.text(`Adjustments: ${record.adjustmentsCount}`, 50);

        if (record.closingBalance) {
          doc.text(`Closing Balance (Bank): ${this.formatCurrency(record.closingBalance)}`, 50);
        }
        if (record.systemClosingBalance) {
          doc.text(`Closing Balance (System): ${this.formatCurrency(record.systemClosingBalance)}`, 50);
        }

        doc.moveDown(1);

        // Unmatched Transactions
        const unmatchedBank = record.bankTransactions.filter(
          (t) => t.status === ReconciliationStatus.UNMATCHED,
        );
        const unmatchedSystem = record.systemTransactions.filter(
          (t) => t.status === ReconciliationStatus.UNMATCHED,
        );

        if (unmatchedBank.length > 0 || unmatchedSystem.length > 0) {
          doc.fontSize(14).font('Helvetica-Bold');
          doc.text('Unmatched Transactions', 50);
          doc.moveDown(0.3);

          doc.fontSize(10).font('Helvetica');
          doc.text('Bank Transactions:', 50);
          doc.moveDown(0.2);

          unmatchedBank.forEach((t) => {
            doc.text(
              `${this.formatDate(t.transactionDate)} | ${t.description.substring(0, 40)} | ${this.formatCurrency(t.amount)} | ${t.type}`,
              60,
            );
            doc.moveDown(0.15);
          });

          doc.moveDown(0.3);
          doc.text('System Transactions:', 50);
          doc.moveDown(0.2);

          unmatchedSystem.forEach((t) => {
            doc.text(
              `${this.formatDate(t.transactionDate)} | ${t.description.substring(0, 40)} | ${this.formatCurrency(t.amount)} | ${t.type}`,
              60,
            );
            doc.moveDown(0.15);
          });
        }

        // Footer
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);
          doc.fontSize(8).font('Helvetica');
          doc.text(
            `Page ${i + 1} of ${pageCount}`,
            doc.page.width - 100,
            doc.page.height - 30,
          );
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async generateExcelReport(
    organizationId: string,
    recordId: string,
  ): Promise<Buffer> {
    const record = await this.reconciliationRecordsRepository.findOne({
      where: { id: recordId, organization: { id: organizationId } },
      relations: [
        'organization',
        'createdBy',
        'bankTransactions',
        'systemTransactions',
        'systemTransactions.expense',
      ],
    });

    if (!record) {
      throw new NotFoundException('Reconciliation record not found');
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Bank Reconciliation');

    // Header
    worksheet.mergeCells('A1:F1');
    worksheet.getCell('A1').value = 'Bank Reconciliation Summary';
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    worksheet.getCell('A2').value = `Organization: ${record.organization.name}`;
    worksheet.getCell('A3').value = `Period: ${this.formatDate(record.statementPeriodStart)} to ${this.formatDate(record.statementPeriodEnd)}`;
    worksheet.getCell('A4').value = `Reconciliation Date: ${this.formatDate(record.reconciliationDate)}`;

    // Summary
    let row = 6;
    worksheet.getCell(`A${row}`).value = 'Summary';
    worksheet.getCell(`A${row}`).font = { bold: true };
    row++;

    worksheet.getCell(`A${row}`).value = 'Total Bank Credits:';
    worksheet.getCell(`B${row}`).value = parseFloat(record.totalBankCredits);
    row++;
    worksheet.getCell(`A${row}`).value = 'Total Bank Debits:';
    worksheet.getCell(`B${row}`).value = parseFloat(record.totalBankDebits);
    row++;
    worksheet.getCell(`A${row}`).value = 'Matched Transactions:';
    worksheet.getCell(`B${row}`).value = record.totalMatched;
    row++;
    worksheet.getCell(`A${row}`).value = 'Unmatched Transactions:';
    worksheet.getCell(`B${row}`).value = record.totalUnmatched;
    row++;
    worksheet.getCell(`A${row}`).value = 'Adjustments:';
    worksheet.getCell(`B${row}`).value = record.adjustmentsCount;
    row += 2;

    // Bank Transactions
    worksheet.getCell(`A${row}`).value = 'Bank Transactions';
    worksheet.getCell(`A${row}`).font = { bold: true };
    row++;

    worksheet.getCell(`A${row}`).value = 'Date';
    worksheet.getCell(`B${row}`).value = 'Description';
    worksheet.getCell(`C${row}`).value = 'Amount';
    worksheet.getCell(`D${row}`).value = 'Type';
    worksheet.getCell(`E${row}`).value = 'Status';
    worksheet.getCell(`F${row}`).value = 'Reference';
    worksheet.getRow(row).font = { bold: true };
    row++;

    record.bankTransactions.forEach((t) => {
      worksheet.getCell(`A${row}`).value = new Date(t.transactionDate);
      worksheet.getCell(`B${row}`).value = t.description;
      worksheet.getCell(`C${row}`).value = parseFloat(t.amount);
      worksheet.getCell(`D${row}`).value = t.type;
      worksheet.getCell(`E${row}`).value = t.status;
      worksheet.getCell(`F${row}`).value = t.reference || '';
      row++;
    });

    row += 2;

    // System Transactions
    worksheet.getCell(`A${row}`).value = 'System Transactions';
    worksheet.getCell(`A${row}`).font = { bold: true };
    row++;

    worksheet.getCell(`A${row}`).value = 'Date';
    worksheet.getCell(`B${row}`).value = 'Description';
    worksheet.getCell(`C${row}`).value = 'Amount';
    worksheet.getCell(`D${row}`).value = 'Type';
    worksheet.getCell(`E${row}`).value = 'Status';
    worksheet.getCell(`F${row}`).value = 'Source';
    worksheet.getRow(row).font = { bold: true };
    row++;

    record.systemTransactions.forEach((t) => {
      worksheet.getCell(`A${row}`).value = new Date(t.transactionDate);
      worksheet.getCell(`B${row}`).value = t.description;
      worksheet.getCell(`C${row}`).value = parseFloat(t.amount);
      worksheet.getCell(`D${row}`).value = t.type;
      worksheet.getCell(`E${row}`).value = t.status;
      worksheet.getCell(`F${row}`).value = t.source;
      row++;
    });

    // Auto-size columns
    worksheet.columns.forEach((column) => {
      column.width = 15;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private formatCurrency(value: string | number): string {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return 'AED 0.00';
    return `AED ${numValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }

  private formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}

