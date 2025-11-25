import { TransactionType } from '../../common/enums/transaction-type.enum';
export interface ParsedTransaction {
    transactionDate: string;
    description: string;
    amount: string;
    type: TransactionType;
    balance?: string | null;
    reference?: string | null;
}
export declare class BankStatementParserService {
    parseFile(file: Express.Multer.File): Promise<ParsedTransaction[]>;
    private parseCSV;
    private parseExcel;
    private parsePDF;
    private processPDFText;
    private mapCSVRow;
    private mapExcelRow;
    private mapPDFLine;
    private findColumn;
    private parseDate;
}
