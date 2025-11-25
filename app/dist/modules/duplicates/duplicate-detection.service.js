"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DuplicateDetectionService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const expense_entity_1 = require("../../entities/expense.entity");
let DuplicateDetectionService = class DuplicateDetectionService {
    constructor(expensesRepository) {
        this.expensesRepository = expensesRepository;
    }
    async detectDuplicates(organizationId, vendorName, amount, expenseDate, ocrConfidence, attachments) {
        const matches = [];
        if (!vendorName) {
            return matches;
        }
        const exactMatches = await this.checkAmountVendorDateMatch(organizationId, vendorName, amount, expenseDate);
        matches.push(...exactMatches.map((exp) => ({
            expense: exp,
            similarityScore: 100,
            matchReason: 'amount_vendor_date',
            confidence: 'high',
        })));
        if (ocrConfidence && ocrConfidence >= 0.9) {
            const ocrMatches = await this.checkOcrConfidenceMatch(organizationId, amount, ocrConfidence);
            matches.push(...ocrMatches.map((exp) => ({
                expense: exp,
                similarityScore: 90,
                matchReason: 'ocr_confidence',
                confidence: 'high',
            })));
        }
        const fuzzyMatches = await this.checkFuzzyMatch(organizationId, vendorName, amount, expenseDate);
        matches.push(...fuzzyMatches.map((exp) => ({
            expense: exp,
            similarityScore: this.calculateSimilarityScore(exp, vendorName, amount),
            matchReason: 'fuzzy',
            confidence: 'medium',
        })));
        const uniqueMatches = this.removeDuplicateMatches(matches);
        return uniqueMatches.sort((a, b) => {
            if (a.confidence === 'high' && b.confidence !== 'high')
                return -1;
            if (b.confidence === 'high' && a.confidence !== 'high')
                return 1;
            return b.similarityScore - a.similarityScore;
        });
    }
    async checkAmountVendorDateMatch(organizationId, vendorName, amount, expenseDate) {
        const dateObj = new Date(expenseDate);
        const dateRangeStart = new Date(dateObj);
        dateRangeStart.setDate(dateRangeStart.getDate() - 7);
        const dateRangeEnd = new Date(dateObj);
        dateRangeEnd.setDate(dateRangeEnd.getDate() + 7);
        return this.expensesRepository.find({
            where: {
                organization: { id: organizationId },
                vendorName: (0, typeorm_2.ILike)(vendorName),
                amount: amount.toString(),
                expenseDate: (0, typeorm_2.Between)(dateRangeStart.toISOString().split('T')[0], dateRangeEnd.toISOString().split('T')[0]),
                isDeleted: false,
            },
        });
    }
    async checkOcrConfidenceMatch(organizationId, amount, ocrConfidence) {
        const tolerance = amount * 0.01;
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
    async checkFuzzyMatch(organizationId, vendorName, amount, expenseDate) {
        const tolerance = amount * 0.01;
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
        return expenses.filter((exp) => {
            if (!exp.vendorName)
                return false;
            return this.matchVendorNames(exp.vendorName, vendorName);
        });
    }
    matchVendorNames(vendor1, vendor2) {
        if (vendor1.toLowerCase() === vendor2.toLowerCase()) {
            return true;
        }
        if (vendor1.toLowerCase().includes(vendor2.toLowerCase()) ||
            vendor2.toLowerCase().includes(vendor1.toLowerCase())) {
            return true;
        }
        const distance = this.levenshteinDistance(vendor1.toLowerCase(), vendor2.toLowerCase());
        const maxLength = Math.max(vendor1.length, vendor2.length);
        const similarity = 1 - distance / maxLength;
        return similarity >= 0.85;
    }
    levenshteinDistance(str1, str2) {
        const matrix = [];
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
                }
                else {
                    matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
                }
            }
        }
        return matrix[str2.length][str1.length];
    }
    calculateSimilarityScore(expense, vendorName, amount) {
        let score = 0;
        if (expense.vendorName) {
            const distance = this.levenshteinDistance(expense.vendorName.toLowerCase(), vendorName.toLowerCase());
            const maxLength = Math.max(expense.vendorName.length, vendorName.length);
            const similarity = 1 - distance / maxLength;
            score += similarity * 50;
        }
        const amountDiff = Math.abs(Number(expense.amount) - amount);
        const amountSimilarity = 1 - Math.min(amountDiff / amount, 1);
        score += amountSimilarity * 50;
        return Math.round(score);
    }
    removeDuplicateMatches(matches) {
        const seen = new Set();
        return matches.filter((match) => {
            if (seen.has(match.expense.id)) {
                return false;
            }
            seen.add(match.expense.id);
            return true;
        });
    }
    shouldBlock(matches) {
        return matches.some((match) => match.confidence === 'high');
    }
};
exports.DuplicateDetectionService = DuplicateDetectionService;
exports.DuplicateDetectionService = DuplicateDetectionService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(expense_entity_1.Expense)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], DuplicateDetectionService);
//# sourceMappingURL=duplicate-detection.service.js.map