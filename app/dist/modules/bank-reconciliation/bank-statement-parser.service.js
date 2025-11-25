"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BankStatementParserService = void 0;
const common_1 = require("@nestjs/common");
const csv = require("csv-parser");
const XLSX = require("xlsx");
const stream_1 = require("stream");
const transaction_type_enum_1 = require("../../common/enums/transaction-type.enum");
let pdfParse;
let BankStatementParserService = class BankStatementParserService {
    async parseFile(file) {
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
                throw new common_1.BadRequestException(`Unsupported file format: ${fileExtension}. Supported formats: CSV, XLSX, PDF`);
        }
    }
    async parseCSV(file) {
        return new Promise((resolve, reject) => {
            const transactions = [];
            const stream = stream_1.Readable.from(file.buffer);
            stream
                .pipe(csv())
                .on('data', (row) => {
                try {
                    const transaction = this.mapCSVRow(row);
                    if (transaction) {
                        transactions.push(transaction);
                    }
                }
                catch (error) {
                    console.warn('Error parsing CSV row:', error);
                }
            })
                .on('end', () => {
                if (transactions.length === 0) {
                    reject(new common_1.BadRequestException('No valid transactions found in CSV file'));
                }
                else {
                    resolve(transactions);
                }
            })
                .on('error', (error) => {
                reject(new common_1.BadRequestException(`Error parsing CSV: ${error.message}`));
            });
        });
    }
    async parseExcel(file) {
        try {
            const workbook = XLSX.read(file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet);
            const transactions = [];
            for (const row of rows) {
                try {
                    const transaction = this.mapExcelRow(row);
                    if (transaction) {
                        transactions.push(transaction);
                    }
                }
                catch (error) {
                    console.warn('Error parsing Excel row:', error);
                }
            }
            if (transactions.length === 0) {
                throw new common_1.BadRequestException('No valid transactions found in Excel file');
            }
            return transactions;
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException(`Error parsing Excel: ${error.message}`);
        }
    }
    async parsePDF(file) {
        try {
            if (!pdfParse) {
                try {
                    const pdfParseModule = await Promise.resolve().then(() => require('pdf-parse'));
                    pdfParse = pdfParseModule.default || pdfParseModule;
                }
                catch (importError) {
                    try {
                        pdfParse = require('pdf-parse');
                    }
                    catch (requireError) {
                        throw new common_1.BadRequestException(`Failed to load pdf-parse module: ${importError instanceof Error ? importError.message : 'Unknown error'}`);
                    }
                }
            }
            const PDFParseClass = pdfParse.PDFParse || pdfParse.default?.PDFParse;
            if (!PDFParseClass || typeof PDFParseClass !== 'function') {
                throw new common_1.BadRequestException(`PDFParse class not found in pdf-parse module. Please ensure pdf-parse package is properly installed and node_modules are up to date.`);
            }
            const uint8Array = new Uint8Array(file.buffer);
            const parser = new PDFParseClass(uint8Array);
            const result = await parser.getText();
            const text = result.text;
            return this.processPDFText(text);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException(`Error parsing PDF: ${error.message}`);
        }
    }
    processPDFText(text) {
        const transactions = [];
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.length > 0) {
                const dateMatch = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
                if (dateMatch) {
                    const amountMatch = line.match(/(\d+\.?\d*)/g);
                    if (amountMatch && amountMatch.length > 0) {
                        try {
                            const transaction = this.mapPDFLine(line, dateMatch[0], amountMatch);
                            if (transaction) {
                                transactions.push(transaction);
                            }
                        }
                        catch (error) {
                            console.warn('Error parsing PDF line:', error);
                        }
                    }
                }
            }
        }
        if (transactions.length === 0) {
            throw new common_1.BadRequestException('No valid transactions found in PDF file. Please ensure the PDF contains structured transaction data.');
        }
        return transactions;
    }
    mapCSVRow(row) {
        const dateCol = this.findColumn(row, ['date', 'transaction_date', 'txn_date', 'transactiondate']);
        const descCol = this.findColumn(row, ['description', 'narration', 'details', 'particulars', 'desc']);
        const amountCol = this.findColumn(row, ['amount', 'value', 'amt']);
        const typeCol = this.findColumn(row, ['type', 'transaction_type', 'credit_debit', 'dr_cr']);
        const balanceCol = this.findColumn(row, ['balance', 'closing_balance', 'bal']);
        const refCol = this.findColumn(row, ['reference', 'ref', 'cheque_no', 'transaction_id']);
        if (!dateCol || !descCol || !amountCol) {
            return null;
        }
        const dateStr = this.parseDate(row[dateCol]);
        if (!dateStr)
            return null;
        let amount = parseFloat(String(row[amountCol]).replace(/,/g, ''));
        if (isNaN(amount))
            return null;
        let type = transaction_type_enum_1.TransactionType.DEBIT;
        if (typeCol) {
            const typeValue = String(row[typeCol]).toLowerCase();
            if (typeValue.includes('credit') || typeValue.includes('cr') || typeValue.includes('+')) {
                type = transaction_type_enum_1.TransactionType.CREDIT;
            }
            else if (typeValue.includes('debit') || typeValue.includes('dr') || typeValue.includes('-')) {
                type = transaction_type_enum_1.TransactionType.DEBIT;
            }
            else if (amount < 0) {
                type = transaction_type_enum_1.TransactionType.DEBIT;
                amount = Math.abs(amount);
            }
            else {
                type = transaction_type_enum_1.TransactionType.CREDIT;
            }
        }
        else {
            if (amount < 0) {
                type = transaction_type_enum_1.TransactionType.DEBIT;
                amount = Math.abs(amount);
            }
            else {
                type = transaction_type_enum_1.TransactionType.CREDIT;
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
    mapExcelRow(row) {
        return this.mapCSVRow(row);
    }
    mapPDFLine(line, dateStr, amounts) {
        const parsedDate = this.parseDate(dateStr);
        if (!parsedDate)
            return null;
        let amount = parseFloat(amounts[amounts.length - 1].replace(/,/g, ''));
        if (isNaN(amount))
            return null;
        const descMatch = line.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s+(.+?)\s+\d+\.?\d*/);
        const description = descMatch ? descMatch[1].trim() : line.replace(/\d+\.?\d*/g, '').trim();
        let type = transaction_type_enum_1.TransactionType.DEBIT;
        if (amount < 0) {
            type = transaction_type_enum_1.TransactionType.DEBIT;
            amount = Math.abs(amount);
        }
        else if (line.toLowerCase().includes('credit') || line.toLowerCase().includes('cr')) {
            type = transaction_type_enum_1.TransactionType.CREDIT;
        }
        else {
            type = transaction_type_enum_1.TransactionType.CREDIT;
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
    findColumn(row, possibleNames) {
        const keys = Object.keys(row).map((k) => k.toLowerCase());
        for (const name of possibleNames) {
            const found = keys.find((k) => k.includes(name.toLowerCase()));
            if (found) {
                return Object.keys(row).find((k) => k.toLowerCase() === found) || null;
            }
        }
        return null;
    }
    parseDate(dateStr) {
        if (!dateStr)
            return null;
        const formats = [
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
            /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})/,
        ];
        for (const format of formats) {
            const match = dateStr.match(format);
            if (match) {
                let year, month, day;
                if (match[3].length === 4) {
                    if (parseInt(match[1]) > 12) {
                        day = match[1].padStart(2, '0');
                        month = match[2].padStart(2, '0');
                        year = match[3];
                    }
                    else {
                        year = match[1];
                        month = match[2].padStart(2, '0');
                        day = match[3].padStart(2, '0');
                    }
                }
                else {
                    day = match[1].padStart(2, '0');
                    month = match[2].padStart(2, '0');
                    year = '20' + match[3];
                }
                try {
                    const date = new Date(`${year}-${month}-${day}`);
                    if (!isNaN(date.getTime())) {
                        return date.toISOString().split('T')[0];
                    }
                }
                catch (error) {
                    continue;
                }
            }
        }
        return null;
    }
};
exports.BankStatementParserService = BankStatementParserService;
exports.BankStatementParserService = BankStatementParserService = __decorate([
    (0, common_1.Injectable)()
], BankStatementParserService);
//# sourceMappingURL=bank-statement-parser.service.js.map