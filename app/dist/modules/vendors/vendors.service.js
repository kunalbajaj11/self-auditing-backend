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
exports.VendorsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const vendor_entity_1 = require("./vendor.entity");
const expense_entity_1 = require("../../entities/expense.entity");
let VendorsService = class VendorsService {
    constructor(vendorsRepository, expensesRepository) {
        this.vendorsRepository = vendorsRepository;
        this.expensesRepository = expensesRepository;
    }
    async findAll(organizationId, filters) {
        const query = this.vendorsRepository
            .createQueryBuilder('vendor')
            .where('vendor.organization_id = :organizationId', { organizationId });
        if (filters?.search) {
            query.andWhere('(vendor.name ILIKE :search OR vendor.display_name ILIKE :search)', { search: `%${filters.search}%` });
        }
        if (filters?.category) {
            query.andWhere('vendor.category = :category', {
                category: filters.category,
            });
        }
        if (filters?.isActive !== undefined) {
            query.andWhere('vendor.is_active = :isActive', {
                isActive: filters.isActive,
            });
        }
        query.orderBy('vendor.name', 'ASC');
        return query.getMany();
    }
    async findById(organizationId, id) {
        const vendor = await this.vendorsRepository.findOne({
            where: { id, organization: { id: organizationId } },
            relations: ['organization'],
        });
        if (!vendor) {
            throw new common_1.NotFoundException('Vendor not found');
        }
        return vendor;
    }
    async search(organizationId, query) {
        return this.vendorsRepository.find({
            where: {
                organization: { id: organizationId },
                name: (0, typeorm_2.ILike)(`%${query}%`),
                isActive: true,
            },
            take: 10,
            order: { lastUsedAt: 'DESC', name: 'ASC' },
        });
    }
    async create(organizationId, dto) {
        const vendor = this.vendorsRepository.create({
            organization: { id: organizationId },
            name: dto.name,
            displayName: dto.displayName,
            vendorTrn: dto.vendorTrn,
            category: dto.category,
            address: dto.address,
            city: dto.city,
            country: dto.country,
            phone: dto.phone,
            email: dto.email,
            website: dto.website,
            contactPerson: dto.contactPerson,
            preferredCurrency: dto.preferredCurrency || 'AED',
            paymentTerms: dto.paymentTerms,
            notes: dto.notes,
            firstUsedAt: new Date(),
            lastUsedAt: new Date(),
            isActive: true,
        });
        return this.vendorsRepository.save(vendor);
    }
    async update(organizationId, id, dto) {
        const vendor = await this.findById(organizationId, id);
        Object.assign(vendor, {
            ...dto,
            lastUsedAt: new Date(),
        });
        return this.vendorsRepository.save(vendor);
    }
    async delete(organizationId, id) {
        const vendor = await this.findById(organizationId, id);
        vendor.isActive = false;
        await this.vendorsRepository.save(vendor);
    }
    async getVendorSpend(organizationId, vendorId, startDate, endDate) {
        const vendor = await this.findById(organizationId, vendorId);
        const query = this.expensesRepository
            .createQueryBuilder('expense')
            .leftJoin('expense.category', 'category')
            .where('expense.organization_id = :organizationId', { organizationId })
            .andWhere('expense.vendor_id = :vendorId', { vendorId })
            .andWhere('expense.is_deleted = false');
        if (startDate) {
            query.andWhere('expense.expense_date >= :startDate', { startDate });
        }
        if (endDate) {
            query.andWhere('expense.expense_date <= :endDate', { endDate });
        }
        const expenses = await query
            .orderBy('expense.expense_date', 'DESC')
            .getMany();
        const totalSpend = expenses.reduce((sum, exp) => sum + Number(exp.baseAmount || exp.totalAmount || 0), 0);
        const totalExpenses = expenses.length;
        const averageExpense = totalExpenses > 0 ? totalSpend / totalExpenses : 0;
        const byCategory = new Map();
        expenses.forEach((exp) => {
            const categoryName = exp.category?.name || 'Uncategorized';
            const existing = byCategory.get(categoryName) || { amount: 0, count: 0 };
            byCategory.set(categoryName, {
                amount: existing.amount + Number(exp.baseAmount || exp.totalAmount || 0),
                count: existing.count + 1,
            });
        });
        const byMonth = new Map();
        expenses.forEach((exp) => {
            const month = exp.expenseDate.substring(0, 7);
            const existing = byMonth.get(month) || { amount: 0, count: 0 };
            byMonth.set(month, {
                amount: existing.amount + Number(exp.baseAmount || exp.totalAmount || 0),
                count: existing.count + 1,
            });
        });
        return {
            vendor,
            totalSpend,
            totalExpenses,
            averageExpense,
            lastExpenseDate: expenses[0]?.expenseDate
                ? new Date(expenses[0].expenseDate)
                : null,
            firstExpenseDate: expenses[expenses.length - 1]?.expenseDate
                ? new Date(expenses[expenses.length - 1].expenseDate)
                : null,
            byCategory: Array.from(byCategory.entries()).map(([category, data]) => ({
                category,
                ...data,
            })),
            byMonth: Array.from(byMonth.entries())
                .map(([month, data]) => ({ month, ...data }))
                .sort((a, b) => a.month.localeCompare(b.month)),
        };
    }
    async getTopVendors(organizationId, limit = 10, startDate, endDate) {
        const query = this.expensesRepository
            .createQueryBuilder('expense')
            .leftJoin('expense.vendor', 'vendor')
            .select('vendor.id', 'vendorId')
            .addSelect('SUM(expense.base_amount)', 'totalSpend')
            .addSelect('COUNT(expense.id)', 'totalExpenses')
            .addSelect('MAX(expense.expense_date)', 'lastExpenseDate')
            .where('expense.organization_id = :organizationId', { organizationId })
            .andWhere('expense.vendor_id IS NOT NULL')
            .andWhere('expense.is_deleted = false');
        if (startDate) {
            query.andWhere('expense.expense_date >= :startDate', { startDate });
        }
        if (endDate) {
            query.andWhere('expense.expense_date <= :endDate', { endDate });
        }
        query.groupBy('vendor.id').orderBy('totalSpend', 'DESC').limit(limit);
        const results = await query.getRawMany();
        const totalSpendAll = results.reduce((sum, r) => sum + Number(r.totalSpend || 0), 0);
        const vendors = await Promise.all(results.map((r) => this.findById(organizationId, r.vendorId)));
        return results.map((result, index) => {
            const totalSpend = Number(result.totalSpend || 0);
            const totalExpenses = Number(result.totalExpenses || 0);
            return {
                vendor: vendors[index],
                totalSpend,
                totalExpenses,
                percentageOfTotal: totalSpendAll > 0 ? (totalSpend / totalSpendAll) * 100 : 0,
                averageExpense: totalExpenses > 0 ? totalSpend / totalExpenses : 0,
                lastExpenseDate: result.lastExpenseDate
                    ? new Date(result.lastExpenseDate)
                    : null,
            };
        });
    }
};
exports.VendorsService = VendorsService;
exports.VendorsService = VendorsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(vendor_entity_1.Vendor)),
    __param(1, (0, typeorm_1.InjectRepository)(expense_entity_1.Expense)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], VendorsService);
//# sourceMappingURL=vendors.service.js.map