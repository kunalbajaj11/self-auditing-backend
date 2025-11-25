import { Repository } from 'typeorm';
import { Vendor } from './vendor.entity';
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
export declare class VendorsService {
    private readonly vendorsRepository;
    private readonly expensesRepository;
    constructor(vendorsRepository: Repository<Vendor>, expensesRepository: Repository<Expense>);
    findAll(organizationId: string, filters?: VendorFilterDto): Promise<Vendor[]>;
    findById(organizationId: string, id: string): Promise<Vendor>;
    search(organizationId: string, query: string): Promise<Vendor[]>;
    create(organizationId: string, dto: Partial<Vendor>): Promise<Vendor>;
    update(organizationId: string, id: string, dto: Partial<Vendor>): Promise<Vendor>;
    delete(organizationId: string, id: string): Promise<void>;
    getVendorSpend(organizationId: string, vendorId: string, startDate?: string, endDate?: string): Promise<VendorSpendSummary>;
    getTopVendors(organizationId: string, limit?: number, startDate?: string, endDate?: string): Promise<TopVendor[]>;
}
