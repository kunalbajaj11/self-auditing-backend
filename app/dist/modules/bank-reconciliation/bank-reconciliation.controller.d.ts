import { Response } from 'express';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationReportService } from './reconciliation-report.service';
import { UploadStatementDto } from './dto/upload-statement.dto';
import { MatchTransactionsDto } from './dto/match-transactions.dto';
import { ManualEntryDto } from './dto/manual-entry.dto';
import { ReconciliationFilterDto } from './dto/reconciliation-filter.dto';
export declare class BankReconciliationController {
    private readonly reconciliationService;
    private readonly reportService;
    constructor(reconciliationService: ReconciliationService, reportService: ReconciliationReportService);
    uploadStatement(user: AuthenticatedUser, file: Express.Multer.File, dto: UploadStatementDto): Promise<import("../../entities/reconciliation-record.entity").ReconciliationRecord>;
    listReconciliations(user: AuthenticatedUser, filters: ReconciliationFilterDto): Promise<import("../../entities/reconciliation-record.entity").ReconciliationRecord[]>;
    getReconciliationDetail(user: AuthenticatedUser, id: string): Promise<import("../../entities/reconciliation-record.entity").ReconciliationRecord>;
    matchTransactions(user: AuthenticatedUser, dto: MatchTransactionsDto): Promise<{
        message: string;
    }>;
    createManualEntry(user: AuthenticatedUser, dto: ManualEntryDto & {
        reconciliationRecordId: string;
    }): Promise<import("../../entities/system-transaction.entity").SystemTransaction>;
    downloadPDFReport(user: AuthenticatedUser, id: string, res: Response): Promise<void>;
    downloadExcelReport(user: AuthenticatedUser, id: string, res: Response): Promise<void>;
}
