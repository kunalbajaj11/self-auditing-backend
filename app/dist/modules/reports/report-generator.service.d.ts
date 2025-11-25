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
            highestCategorySpend?: {
                category: string;
                amount: number;
            };
            topVendor?: {
                vendor: string;
                amount: number;
            };
            averageExpenseAmount?: number;
            totalCreditNotes?: number;
            totalAdjustments?: number;
            userWithHighestUploadCount?: {
                user: string;
                count: number;
            };
        };
    };
}
export declare class ReportGeneratorService {
    private formatCurrency;
    private formatDate;
    generatePDF(reportData: ReportData): Promise<Buffer>;
    private shouldUseLandscape;
    private getReportTitle;
    private addPDFHeader;
    private addPDFSummary;
    private addPDFFooter;
    generateXLSX(reportData: ReportData): Promise<Buffer>;
    private addXLSXExpenseReport;
    private addXLSXPivotSheets;
    generateCSV(reportData: ReportData): Promise<Buffer>;
    private addPDFContent;
    private getColumnsForReport;
    private formatHeaderLabel;
    private formatCellValue;
    private getColumnAlignment;
    private shouldShowTotal;
    private calculateTotalRow;
    private addPDFStructuredContent;
    private addPDFTable;
    private addXLSXHeader;
    private addXLSXContent;
    private addXLSXVATReport;
    private addXLSXBankReconciliation;
    private addXLSXTrialBalance;
    private addCSVContent;
}
