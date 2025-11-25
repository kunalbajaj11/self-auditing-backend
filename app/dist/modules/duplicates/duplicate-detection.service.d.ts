import { Repository } from 'typeorm';
import { Expense } from '../../entities/expense.entity';
export interface DuplicateMatch {
    expense: Expense;
    similarityScore: number;
    matchReason: 'amount_vendor_date' | 'ocr_confidence' | 'receipt_hash' | 'fuzzy';
    confidence: 'high' | 'medium' | 'low';
}
export declare class DuplicateDetectionService {
    private readonly expensesRepository;
    constructor(expensesRepository: Repository<Expense>);
    detectDuplicates(organizationId: string, vendorName: string | null, amount: number, expenseDate: string, ocrConfidence?: number, attachments?: Array<{
        fileUrl: string;
    }>): Promise<DuplicateMatch[]>;
    private checkAmountVendorDateMatch;
    private checkOcrConfidenceMatch;
    private checkFuzzyMatch;
    private matchVendorNames;
    private levenshteinDistance;
    private calculateSimilarityScore;
    private removeDuplicateMatches;
    shouldBlock(matches: DuplicateMatch[]): boolean;
}
