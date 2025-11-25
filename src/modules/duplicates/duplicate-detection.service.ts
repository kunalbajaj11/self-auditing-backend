import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, ILike } from 'typeorm';
import { Expense } from '../../entities/expense.entity';

export interface DuplicateMatch {
  expense: Expense;
  similarityScore: number; // 0-100
  matchReason: 'amount_vendor_date' | 'ocr_confidence' | 'receipt_hash' | 'fuzzy';
  confidence: 'high' | 'medium' | 'low';
}

@Injectable()
export class DuplicateDetectionService {
  constructor(
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
  ) {}

  /**
   * Detect potential duplicate expenses
   */
  async detectDuplicates(
    organizationId: string,
    vendorName: string | null,
    amount: number,
    expenseDate: string,
    ocrConfidence?: number,
    attachments?: Array<{ fileUrl: string }>,
  ): Promise<DuplicateMatch[]> {
    const matches: DuplicateMatch[] = [];

    if (!vendorName) {
      return matches; // Can't detect duplicates without vendor name
    }

    // Strategy 1: Exact match (amount + vendor + date)
    const exactMatches = await this.checkAmountVendorDateMatch(
      organizationId,
      vendorName,
      amount,
      expenseDate,
    );
    matches.push(
      ...exactMatches.map((exp) => ({
        expense: exp,
        similarityScore: 100,
        matchReason: 'amount_vendor_date' as const,
        confidence: 'high' as const,
      })),
    );

    // Strategy 2: OCR confidence match
    if (ocrConfidence && ocrConfidence >= 0.9) {
      const ocrMatches = await this.checkOcrConfidenceMatch(
        organizationId,
        amount,
        ocrConfidence,
      );
      matches.push(
        ...ocrMatches.map((exp) => ({
          expense: exp,
          similarityScore: 90,
          matchReason: 'ocr_confidence' as const,
          confidence: 'high' as const,
        })),
      );
    }

    // Strategy 3: Fuzzy match (similar amount + similar vendor + date)
    const fuzzyMatches = await this.checkFuzzyMatch(
      organizationId,
      vendorName,
      amount,
      expenseDate,
    );
    matches.push(
      ...fuzzyMatches.map((exp) => ({
        expense: exp,
        similarityScore: this.calculateSimilarityScore(exp, vendorName, amount),
        matchReason: 'fuzzy' as const,
        confidence: 'medium' as const,
      })),
    );

    // Remove duplicates and sort by confidence
    const uniqueMatches = this.removeDuplicateMatches(matches);
    return uniqueMatches.sort((a, b) => {
      if (a.confidence === 'high' && b.confidence !== 'high') return -1;
      if (b.confidence === 'high' && a.confidence !== 'high') return 1;
      return b.similarityScore - a.similarityScore;
    });
  }

  /**
   * Check for exact match: same amount + vendor + date (within 7 days)
   */
  private async checkAmountVendorDateMatch(
    organizationId: string,
    vendorName: string,
    amount: number,
    expenseDate: string,
  ): Promise<Expense[]> {
    const dateObj = new Date(expenseDate);
    const dateRangeStart = new Date(dateObj);
    dateRangeStart.setDate(dateRangeStart.getDate() - 7);
    const dateRangeEnd = new Date(dateObj);
    dateRangeEnd.setDate(dateRangeEnd.getDate() + 7);

    return this.expensesRepository.find({
      where: {
        organization: { id: organizationId },
        vendorName: ILike(vendorName),
        amount: amount.toString(),
        expenseDate: Between(
          dateRangeStart.toISOString().split('T')[0],
          dateRangeEnd.toISOString().split('T')[0],
        ),
        isDeleted: false,
      },
    });
  }

  /**
   * Check for OCR confidence match: high confidence + similar amount
   */
  private async checkOcrConfidenceMatch(
    organizationId: string,
    amount: number,
    ocrConfidence: number,
  ): Promise<Expense[]> {
    const tolerance = amount * 0.01; // 1% tolerance

    return this.expensesRepository
      .createQueryBuilder('expense')
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.ocr_confidence >= :minConfidence', {
        minConfidence: (ocrConfidence - 0.05).toString(),
      })
      .andWhere('expense.amount BETWEEN :minAmount AND :maxAmount', {
        minAmount: (amount - tolerance).toString(),
        maxAmount: (amount + tolerance).toString(),
      })
      .andWhere('expense.is_deleted = false')
      .getMany();
  }

  /**
   * Check for fuzzy match: similar amount + similar vendor + date
   */
  private async checkFuzzyMatch(
    organizationId: string,
    vendorName: string,
    amount: number,
    expenseDate: string,
  ): Promise<Expense[]> {
    const tolerance = amount * 0.01; // 1% tolerance
    const dateObj = new Date(expenseDate);
    const dateRangeStart = new Date(dateObj);
    dateRangeStart.setDate(dateRangeStart.getDate() - 7);
    const dateRangeEnd = new Date(dateObj);
    dateRangeEnd.setDate(dateRangeEnd.getDate() + 7);

    const expenses = await this.expensesRepository
      .createQueryBuilder('expense')
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.amount BETWEEN :minAmount AND :maxAmount', {
        minAmount: (amount - tolerance).toString(),
        maxAmount: (amount + tolerance).toString(),
      })
      .andWhere('expense.expense_date BETWEEN :startDate AND :endDate', {
        startDate: dateRangeStart.toISOString().split('T')[0],
        endDate: dateRangeEnd.toISOString().split('T')[0],
      })
      .andWhere('expense.is_deleted = false')
      .getMany();

    // Filter by vendor name similarity
    return expenses.filter((exp) => {
      if (!exp.vendorName) return false;
      return this.matchVendorNames(exp.vendorName, vendorName);
    });
  }

  /**
   * Match vendor names with fuzzy logic
   */
  private matchVendorNames(vendor1: string, vendor2: string): boolean {
    // Exact match (case-insensitive)
    if (vendor1.toLowerCase() === vendor2.toLowerCase()) {
      return true;
    }

    // One contains the other
    if (
      vendor1.toLowerCase().includes(vendor2.toLowerCase()) ||
      vendor2.toLowerCase().includes(vendor1.toLowerCase())
    ) {
      return true;
    }

    // Fuzzy match using Levenshtein distance
    const distance = this.levenshteinDistance(
      vendor1.toLowerCase(),
      vendor2.toLowerCase(),
    );
    const maxLength = Math.max(vendor1.length, vendor2.length);
    const similarity = 1 - distance / maxLength;

    return similarity >= 0.85; // 85% similarity threshold
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1, // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate similarity score for fuzzy match
   */
  private calculateSimilarityScore(
    expense: Expense,
    vendorName: string,
    amount: number,
  ): number {
    let score = 0;

    // Vendor name similarity (0-50 points)
    if (expense.vendorName) {
      const distance = this.levenshteinDistance(
        expense.vendorName.toLowerCase(),
        vendorName.toLowerCase(),
      );
      const maxLength = Math.max(expense.vendorName.length, vendorName.length);
      const similarity = 1 - distance / maxLength;
      score += similarity * 50;
    }

    // Amount similarity (0-50 points)
    const amountDiff = Math.abs(Number(expense.amount) - amount);
    const amountSimilarity = 1 - Math.min(amountDiff / amount, 1);
    score += amountSimilarity * 50;

    return Math.round(score);
  }

  /**
   * Remove duplicate matches (same expense ID)
   */
  private removeDuplicateMatches(matches: DuplicateMatch[]): DuplicateMatch[] {
    const seen = new Set<string>();
    return matches.filter((match) => {
      if (seen.has(match.expense.id)) {
        return false;
      }
      seen.add(match.expense.id);
      return true;
    });
  }

  /**
   * Check if expense should be blocked due to duplicates
   */
  shouldBlock(matches: DuplicateMatch[]): boolean {
    return matches.some((match) => match.confidence === 'high');
  }
}

