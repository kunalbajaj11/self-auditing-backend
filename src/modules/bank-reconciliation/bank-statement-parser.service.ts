import { Injectable, BadRequestException } from '@nestjs/common';
import * as csv from 'csv-parser';
import * as XLSX from 'xlsx';
import { Readable } from 'stream';
import { TransactionType } from '../../common/enums/transaction-type.enum';

// pdf-parse is a CommonJS module, use dynamic import
let pdfParse: any;

export interface ParsedTransaction {
  transactionDate: string;
  description: string;
  amount: string;
  type: TransactionType;
  balance?: string | null;
  reference?: string | null;
}

@Injectable()
export class BankStatementParserService {
  async parseFile(file: Express.Multer.File): Promise<ParsedTransaction[]> {
    const fileExtension = file.originalname.split('.').pop()?.toLowerCase();

    switch (fileExtension) {
      case 'csv':
        return this.parseCSV(file);
      case 'xlsx':
      case 'xls':
        return this.parseExcel(file);
      case 'pdf':
        return this.parsePDF(file);
      default:
        throw new BadRequestException(
          `Unsupported file format: ${fileExtension}. Supported formats: CSV, XLSX, PDF`,
        );
    }
  }

  private async parseCSV(
    file: Express.Multer.File,
  ): Promise<ParsedTransaction[]> {
    return new Promise((resolve, reject) => {
      const transactions: ParsedTransaction[] = [];
      const stream = Readable.from(file.buffer);

      stream
        .pipe(csv())
        .on('data', (row: any) => {
          try {
            const transaction = this.mapCSVRow(row);
            if (transaction) {
              transactions.push(transaction);
            }
          } catch (error) {
            console.warn('Error parsing CSV row:', error);
          }
        })
        .on('end', () => {
          if (transactions.length === 0) {
            reject(
              new BadRequestException(
                'No valid transactions found in CSV file',
              ),
            );
          } else {
            resolve(transactions);
          }
        })
        .on('error', (error) => {
          reject(
            new BadRequestException(`Error parsing CSV: ${error.message}`),
          );
        });
    });
  }

  private async parseExcel(
    file: Express.Multer.File,
  ): Promise<ParsedTransaction[]> {
    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet);

      const transactions: ParsedTransaction[] = [];

      for (const row of rows as any[]) {
        try {
          const transaction = this.mapExcelRow(row);
          if (transaction) {
            transactions.push(transaction);
          }
        } catch (error) {
          console.warn('Error parsing Excel row:', error);
        }
      }

      if (transactions.length === 0) {
        throw new BadRequestException(
          'No valid transactions found in Excel file',
        );
      }

      return transactions;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Error parsing Excel: ${error.message}`);
    }
  }

  private async parsePDF(
    file: Express.Multer.File,
  ): Promise<ParsedTransaction[]> {
    try {
      // Dynamically import pdf-parse if not already loaded
      if (!pdfParse) {
        try {
          // Try ES6 dynamic import first
          const pdfParseModule = await import('pdf-parse');
          // pdf-parse exports an object with PDFParse class
          pdfParse = pdfParseModule.default || pdfParseModule;
        } catch (importError) {
          // Fallback to require for CommonJS
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            pdfParse = require('pdf-parse');
          } catch (requireError) {
            throw new BadRequestException(
              `Failed to load pdf-parse module: ${importError instanceof Error ? importError.message : 'Unknown error'}`,
            );
          }
        }
      }

      // pdf-parse v2.4.5 exports an object with PDFParse class constructor
      // We need to get the PDFParse class and instantiate it
      const PDFParseClass = pdfParse.PDFParse || pdfParse.default?.PDFParse;

      if (!PDFParseClass || typeof PDFParseClass !== 'function') {
        throw new BadRequestException(
          `PDFParse class not found in pdf-parse module. Please ensure pdf-parse package is properly installed and node_modules are up to date.`,
        );
      }

      // Convert buffer to Uint8Array (pdf-parse v2.4.5 requires Uint8Array)
      const uint8Array = new Uint8Array(file.buffer);

      // Create a new instance of PDFParse with the Uint8Array
      const parser = new PDFParseClass(uint8Array);

      // Call getText() method to extract text from PDF
      const result = await parser.getText();
      const text = result.text;

      return this.processPDFText(text);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Error parsing PDF: ${error.message}`);
    }
  }

  private processPDFText(text: string): ParsedTransaction[] {
    // Basic PDF parsing - extract transactions from text
    // This is a simplified parser; for production, consider using OCR or more sophisticated parsing
    const transactions: ParsedTransaction[] = [];
    const lines = text.split('\n');

    // Try to identify transaction patterns
    // This is a basic implementation - may need enhancement based on actual PDF formats
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length > 0) {
        // Look for date patterns (DD/MM/YYYY, DD-MM-YYYY, etc.)
        const dateMatch = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
        if (dateMatch) {
          // Try to extract amount (numbers with decimal)
          const amountMatch = line.match(/(\d+\.?\d*)/g);
          if (amountMatch && amountMatch.length > 0) {
            try {
              const transaction = this.mapPDFLine(
                line,
                dateMatch[0],
                amountMatch,
              );
              if (transaction) {
                transactions.push(transaction);
              }
            } catch (error) {
              console.warn('Error parsing PDF line:', error);
            }
          }
        }
      }
    }

    if (transactions.length === 0) {
      throw new BadRequestException(
        'No valid transactions found in PDF file. Please ensure the PDF contains structured transaction data.',
      );
    }

    return transactions;
  }

  private mapCSVRow(row: any): ParsedTransaction | null {
    // Auto-detect column mapping
    const dateCol = this.findColumn(row, [
      'date',
      'transaction_date',
      'txn_date',
      'transactiondate',
    ]);
    const descCol = this.findColumn(row, [
      'description',
      'narration',
      'details',
      'particulars',
      'desc',
    ]);
    const amountCol = this.findColumn(row, ['amount', 'value', 'amt']);
    const typeCol = this.findColumn(row, [
      'type',
      'transaction_type',
      'credit_debit',
      'dr_cr',
    ]);
    const balanceCol = this.findColumn(row, [
      'balance',
      'closing_balance',
      'bal',
    ]);
    const refCol = this.findColumn(row, [
      'reference',
      'ref',
      'cheque_no',
      'transaction_id',
    ]);

    if (!dateCol || !descCol || !amountCol) {
      return null;
    }

    const dateStr = this.parseDate(row[dateCol]);
    if (!dateStr) return null;

    let amount = parseFloat(String(row[amountCol]).replace(/,/g, ''));
    if (isNaN(amount)) return null;

    let type = TransactionType.DEBIT;
    if (typeCol) {
      const typeValue = String(row[typeCol]).toLowerCase();
      if (
        typeValue.includes('credit') ||
        typeValue.includes('cr') ||
        typeValue.includes('+')
      ) {
        type = TransactionType.CREDIT;
      } else if (
        typeValue.includes('debit') ||
        typeValue.includes('dr') ||
        typeValue.includes('-')
      ) {
        type = TransactionType.DEBIT;
      } else if (amount < 0) {
        type = TransactionType.DEBIT;
        amount = Math.abs(amount);
      } else {
        type = TransactionType.CREDIT;
      }
    } else {
      // If no type column, infer from amount sign
      if (amount < 0) {
        type = TransactionType.DEBIT;
        amount = Math.abs(amount);
      } else {
        type = TransactionType.CREDIT;
      }
    }

    return {
      transactionDate: dateStr,
      description: String(row[descCol] || '').trim(),
      amount: amount.toFixed(2),
      type,
      balance: balanceCol ? String(row[balanceCol]).replace(/,/g, '') : null,
      reference: refCol ? String(row[refCol]).trim() : null,
    };
  }

  private mapExcelRow(row: any): ParsedTransaction | null {
    // Similar to CSV mapping
    return this.mapCSVRow(row);
  }

  private mapPDFLine(
    line: string,
    dateStr: string,
    amounts: string[],
  ): ParsedTransaction | null {
    const parsedDate = this.parseDate(dateStr);
    if (!parsedDate) return null;

    // Take the last amount as the transaction amount (usually the rightmost)
    let amount = parseFloat(amounts[amounts.length - 1].replace(/,/g, ''));
    if (isNaN(amount)) return null;

    // Extract description (everything between date and amount)
    const descMatch = line.match(
      /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s+(.+?)\s+\d+\.?\d*/,
    );
    const description = descMatch
      ? descMatch[1].trim()
      : line.replace(/\d+\.?\d*/g, '').trim();

    // Infer type from amount sign or context
    let type = TransactionType.DEBIT;
    if (amount < 0) {
      type = TransactionType.DEBIT;
      amount = Math.abs(amount);
    } else if (
      line.toLowerCase().includes('credit') ||
      line.toLowerCase().includes('cr')
    ) {
      type = TransactionType.CREDIT;
    } else {
      type = TransactionType.CREDIT; // Default assumption
    }

    return {
      transactionDate: parsedDate,
      description: description || 'Transaction',
      amount: amount.toFixed(2),
      type,
      balance: null,
      reference: null,
    };
  }

  private findColumn(row: any, possibleNames: string[]): string | null {
    const keys = Object.keys(row).map((k) => k.toLowerCase());
    for (const name of possibleNames) {
      const found = keys.find((k) => k.includes(name.toLowerCase()));
      if (found) {
        return Object.keys(row).find((k) => k.toLowerCase() === found) || null;
      }
    }
    return null;
  }

  private parseDate(dateStr: string): string | null {
    if (!dateStr) return null;

    // Try various date formats
    const formats = [
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, // DD/MM/YYYY or DD-MM-YYYY
      /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/, // YYYY/MM/DD or YYYY-MM-DD
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})/, // DD/MM/YY or DD-MM-YY
    ];

    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        let year, month, day;
        if (match[3].length === 4) {
          // YYYY format
          if (parseInt(match[1]) > 12) {
            // DD/MM/YYYY
            day = match[1].padStart(2, '0');
            month = match[2].padStart(2, '0');
            year = match[3];
          } else {
            // YYYY/MM/DD
            year = match[1];
            month = match[2].padStart(2, '0');
            day = match[3].padStart(2, '0');
          }
        } else {
          // YY format
          day = match[1].padStart(2, '0');
          month = match[2].padStart(2, '0');
          year = '20' + match[3];
        }

        try {
          const date = new Date(`${year}-${month}-${day}`);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
        } catch (error) {
          continue;
        }
      }
    }

    return null;
  }
}
