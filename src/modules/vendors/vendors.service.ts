import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, Between } from 'typeorm';
import { Vendor } from './vendor.entity';
import { Organization } from '../../entities/organization.entity';
import { Expense } from '../../entities/expense.entity';

export interface VendorFilterDto {
  search?: string;
  category?: string;
  isActive?: boolean;
}

export interface DateFilterDto {
  startDate?: string;
  endDate?: string;
}

export interface VendorSpendSummary {
  vendor: Vendor;
  totalSpend: number;
  totalExpenses: number;
  averageExpense: number;
  lastExpenseDate: Date | null;
  firstExpenseDate: Date | null;
  byCategory: Array<{
    category: string;
    amount: number;
    count: number;
  }>;
  byMonth: Array<{
    month: string;
    amount: number;
    count: number;
  }>;
}

export interface TopVendor {
  vendor: Vendor;
  totalSpend: number;
  totalExpenses: number;
  percentageOfTotal: number;
  averageExpense: number;
  lastExpenseDate: Date | null;
}

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(Vendor)
    private readonly vendorsRepository: Repository<Vendor>,
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
  ) {}

  async findAll(
    organizationId: string,
    filters?: VendorFilterDto,
  ): Promise<Vendor[]> {
    const query = this.vendorsRepository
      .createQueryBuilder('vendor')
      .where('vendor.organization_id = :organizationId', { organizationId });

    if (filters?.search) {
      query.andWhere(
        '(vendor.name ILIKE :search OR vendor.display_name ILIKE :search)',
        { search: `%${filters.search}%` },
      );
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

  async findById(organizationId: string, id: string): Promise<Vendor> {
    const vendor = await this.vendorsRepository.findOne({
      where: { id, organization: { id: organizationId } },
      relations: ['organization'],
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    return vendor;
  }

  async search(organizationId: string, query: string): Promise<Vendor[]> {
    return this.vendorsRepository.find({
      where: {
        organization: { id: organizationId },
        name: ILike(`%${query}%`),
        isActive: true,
      },
      take: 10,
      order: { lastUsedAt: 'DESC', name: 'ASC' },
    });
  }

  async create(organizationId: string, dto: Partial<Vendor>): Promise<Vendor> {
    const vendor = this.vendorsRepository.create({
      organization: { id: organizationId } as Organization,
      name: dto.name!,
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

  async update(
    organizationId: string,
    id: string,
    dto: Partial<Vendor>,
  ): Promise<Vendor> {
    const vendor = await this.findById(organizationId, id);

    Object.assign(vendor, {
      ...dto,
      lastUsedAt: new Date(),
    });

    return this.vendorsRepository.save(vendor);
  }

  async delete(organizationId: string, id: string): Promise<void> {
    const vendor = await this.findById(organizationId, id);

    // Soft delete: mark as inactive instead of deleting
    vendor.isActive = false;
    await this.vendorsRepository.save(vendor);
  }

  async getVendorSpend(
    organizationId: string,
    vendorId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<VendorSpendSummary> {
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

    const totalSpend = expenses.reduce(
      (sum, exp) => sum + Number(exp.baseAmount || exp.totalAmount || 0),
      0,
    );
    const totalExpenses = expenses.length;
    const averageExpense = totalExpenses > 0 ? totalSpend / totalExpenses : 0;

    // Group by category
    const byCategory = new Map<string, { amount: number; count: number }>();
    expenses.forEach((exp) => {
      const categoryName = exp.category?.name || 'Uncategorized';
      const existing = byCategory.get(categoryName) || { amount: 0, count: 0 };
      byCategory.set(categoryName, {
        amount:
          existing.amount + Number(exp.baseAmount || exp.totalAmount || 0),
        count: existing.count + 1,
      });
    });

    // Group by month
    const byMonth = new Map<string, { amount: number; count: number }>();
    expenses.forEach((exp) => {
      const month = exp.expenseDate.substring(0, 7); // YYYY-MM
      const existing = byMonth.get(month) || { amount: 0, count: 0 };
      byMonth.set(month, {
        amount:
          existing.amount + Number(exp.baseAmount || exp.totalAmount || 0),
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

  async getTopVendors(
    organizationId: string,
    limit: number = 10,
    startDate?: string,
    endDate?: string,
  ): Promise<TopVendor[]> {
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

    // Calculate total spend for percentage calculation
    const totalSpendAll = results.reduce(
      (sum, r) => sum + Number(r.totalSpend || 0),
      0,
    );

    // Get vendor details
    const vendors = await Promise.all(
      results.map((r) => this.findById(organizationId, r.vendorId)),
    );

    return results.map((result, index) => {
      const totalSpend = Number(result.totalSpend || 0);
      const totalExpenses = Number(result.totalExpenses || 0);
      return {
        vendor: vendors[index],
        totalSpend,
        totalExpenses,
        percentageOfTotal:
          totalSpendAll > 0 ? (totalSpend / totalSpendAll) * 100 : 0,
        averageExpense: totalExpenses > 0 ? totalSpend / totalExpenses : 0,
        lastExpenseDate: result.lastExpenseDate
          ? new Date(result.lastExpenseDate)
          : null,
      };
    });
  }
}
