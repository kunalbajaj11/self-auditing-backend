import { Repository } from 'typeorm';
import { ReconciliationRecord } from '../../entities/reconciliation-record.entity';
import { BankTransaction } from '../../entities/bank-transaction.entity';
import { SystemTransaction } from '../../entities/system-transaction.entity';
export declare class ReconciliationReportService {
    private readonly reconciliationRecordsRepository;
    private readonly bankTransactionsRepository;
    private readonly systemTransactionsRepository;
    constructor(reconciliationRecordsRepository: Repository<ReconciliationRecord>, bankTransactionsRepository: Repository<BankTransaction>, systemTransactionsRepository: Repository<SystemTransaction>);
    generatePDFReport(organizationId: string, recordId: string): Promise<Buffer>;
    generateExcelReport(organizationId: string, recordId: string): Promise<Buffer>;
    private formatCurrency;
    private formatDate;
}
