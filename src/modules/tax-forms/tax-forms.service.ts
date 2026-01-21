import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TaxForm,
  TaxFormType,
  TaxFormStatus,
} from '../../entities/tax-form.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { Expense } from '../../entities/expense.entity';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { Region } from '../../common/enums/region.enum';
import { VatTaxType } from '../../common/enums/vat-tax-type.enum';

export interface VATReturnData {
  period: string;
  organization: {
    name: string;
    vatNumber?: string;
    address?: string;
  };
  sales: {
    standardRate: {
      amount: number;
      vatAmount: number;
      count: number;
    };
    zeroRate: {
      amount: number;
      vatAmount: number;
      count: number;
    };
    exempt: {
      amount: number;
      count: number;
    };
    reverseCharge: {
      amount: number;
      vatAmount: number;
      count: number;
    };
  };
  purchases: {
    standardRate: {
      amount: number;
      vatAmount: number;
      count: number;
    };
    zeroRate: {
      amount: number;
      vatAmount: number;
      count: number;
    };
    exempt: {
      amount: number;
      count: number;
    };
    reverseCharge: {
      amount: number;
      vatAmount: number;
      count: number;
    };
  };
  adjustments: {
    outputVAT: number;
    inputVAT: number;
    description?: string;
  };
  totals: {
    totalOutputVAT: number;
    totalInputVAT: number;
    netVATPayable: number;
    refundable: number;
  };
}

@Injectable()
export class TaxFormsService {
  private readonly logger = new Logger(TaxFormsService.name);

  constructor(
    @InjectRepository(TaxForm)
    private readonly taxFormsRepository: Repository<TaxForm>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
    @InjectRepository(SalesInvoice)
    private readonly salesInvoicesRepository: Repository<SalesInvoice>,
  ) {}

  /**
   * Extract VAT return data from transactions
   */
  async extractVATReturnData(
    organizationId: string,
    period: string,
  ): Promise<VATReturnData> {
    this.logger.log(
      `Extracting VAT return data: organizationId=${organizationId}, period=${period}`,
    );

    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Parse period (format: '2024-01' for monthly, '2024-Q1' for quarterly)
    const { startDate, endDate } = this.parsePeriod(period);

    // Initialize data structure
    const data: VATReturnData = {
      period,
      organization: {
        name: organization.name,
        vatNumber: organization.vatNumber || undefined,
        address: organization.address || undefined,
      },
      sales: {
        standardRate: { amount: 0, vatAmount: 0, count: 0 },
        zeroRate: { amount: 0, vatAmount: 0, count: 0 },
        exempt: { amount: 0, count: 0 },
        reverseCharge: { amount: 0, vatAmount: 0, count: 0 },
      },
      purchases: {
        standardRate: { amount: 0, vatAmount: 0, count: 0 },
        zeroRate: { amount: 0, vatAmount: 0, count: 0 },
        exempt: { amount: 0, count: 0 },
        reverseCharge: { amount: 0, vatAmount: 0, count: 0 },
      },
      adjustments: {
        outputVAT: 0,
        inputVAT: 0,
      },
      totals: {
        totalOutputVAT: 0,
        totalInputVAT: 0,
        netVATPayable: 0,
        refundable: 0,
      },
    };

    // Extract sales data (invoices)
    await this.extractSalesData(organizationId, startDate, endDate, data);

    // Extract purchase data (expenses)
    await this.extractPurchaseData(organizationId, startDate, endDate, data);

    // Calculate totals
    this.calculateTotals(data);

    this.logger.debug(
      `VAT return data extracted: netVATPayable=${data.totals.netVATPayable}`,
    );

    return data;
  }

  /**
   * Extract sales data from invoices
   */
  private async extractSalesData(
    organizationId: string,
    startDate: string,
    endDate: string,
    data: VATReturnData,
  ): Promise<void> {
    const invoices = await this.salesInvoicesRepository
      .createQueryBuilder('invoice')
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.invoice_date >= :startDate', { startDate })
      .andWhere('invoice.invoice_date <= :endDate', { endDate })
      .andWhere('invoice.is_deleted = false')
      .getMany();

    for (const invoice of invoices) {
      const baseAmount = parseFloat(
        invoice.baseAmount || invoice.amount || '0',
      );
      const vatAmount = parseFloat(invoice.vatAmount || '0');
      // SalesInvoice may not have vatTaxType, default to standard
      const vatTaxType = (invoice as any).vatTaxType || 'standard';

      switch (vatTaxType) {
        case 'standard':
          data.sales.standardRate.amount += baseAmount;
          data.sales.standardRate.vatAmount += vatAmount;
          data.sales.standardRate.count += 1;
          break;
        case 'zero_rated':
          data.sales.zeroRate.amount += baseAmount;
          data.sales.zeroRate.vatAmount += vatAmount;
          data.sales.zeroRate.count += 1;
          break;
        case 'exempt':
          data.sales.exempt.amount += baseAmount;
          data.sales.exempt.count += 1;
          break;
        case 'reverse_charge':
          data.sales.reverseCharge.amount += baseAmount;
          data.sales.reverseCharge.vatAmount += vatAmount;
          data.sales.reverseCharge.count += 1;
          break;
      }
    }
  }

  /**
   * Extract purchase data from expenses
   */
  private async extractPurchaseData(
    organizationId: string,
    startDate: string,
    endDate: string,
    data: VATReturnData,
  ): Promise<void> {
    const expenses = await this.expensesRepository
      .createQueryBuilder('expense')
      .where('expense.organization_id = :organizationId', { organizationId })
      .andWhere('expense.expense_date >= :startDate', { startDate })
      .andWhere('expense.expense_date <= :endDate', { endDate })
      .andWhere('expense.is_deleted = false')
      .getMany();

    for (const expense of expenses) {
      const baseAmount = parseFloat(
        expense.baseAmount || expense.amount || '0',
      );
      const vatAmount = parseFloat(expense.vatAmount || '0');
      const vatTaxType = expense.vatTaxType || 'standard';

      switch (vatTaxType) {
        case 'standard':
          data.purchases.standardRate.amount += baseAmount;
          data.purchases.standardRate.vatAmount += vatAmount;
          data.purchases.standardRate.count += 1;
          break;
        case 'zero_rated':
          data.purchases.zeroRate.amount += baseAmount;
          data.purchases.zeroRate.vatAmount += vatAmount;
          data.purchases.zeroRate.count += 1;
          break;
        case 'exempt':
          data.purchases.exempt.amount += baseAmount;
          data.purchases.exempt.count += 1;
          break;
        case 'reverse_charge':
          data.purchases.reverseCharge.amount += baseAmount;
          data.purchases.reverseCharge.vatAmount += vatAmount;
          data.purchases.reverseCharge.count += 1;
          break;
      }
    }
  }

  /**
   * Calculate totals for VAT return
   */
  private calculateTotals(data: VATReturnData): void {
    // Output VAT (from sales)
    data.totals.totalOutputVAT =
      data.sales.standardRate.vatAmount +
      data.sales.zeroRate.vatAmount +
      data.sales.reverseCharge.vatAmount +
      data.adjustments.outputVAT;

    // Input VAT (from purchases)
    data.totals.totalInputVAT =
      data.purchases.standardRate.vatAmount +
      data.purchases.zeroRate.vatAmount +
      data.purchases.reverseCharge.vatAmount +
      data.adjustments.inputVAT;

    // Net VAT Payable
    data.totals.netVATPayable =
      data.totals.totalOutputVAT - data.totals.totalInputVAT;

    // Refundable (if input > output)
    data.totals.refundable =
      data.totals.totalInputVAT > data.totals.totalOutputVAT
        ? data.totals.totalInputVAT - data.totals.totalOutputVAT
        : 0;
  }

  /**
   * Parse period string to start and end dates
   */
  private parsePeriod(period: string): { startDate: string; endDate: string } {
    // Format: '2024-01' for monthly, '2024-Q1' for quarterly, '2024' for annual
    if (period.includes('-Q')) {
      // Quarterly: '2024-Q1'
      const [year, quarter] = period.split('-Q');
      const quarterNum = parseInt(quarter, 10);
      const startMonth = (quarterNum - 1) * 3;
      const endMonth = quarterNum * 3 - 1;

      const startDate = new Date(parseInt(year, 10), startMonth, 1);
      const endDate = new Date(parseInt(year, 10), endMonth + 1, 0); // Last day of month

      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      };
    } else if (period.match(/^\d{4}-\d{2}$/)) {
      // Monthly: '2024-01'
      const [year, month] = period.split('-');
      const startDate = new Date(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        1,
      );
      const endDate = new Date(parseInt(year, 10), parseInt(month, 10), 0); // Last day of month

      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      };
    } else if (period.match(/^\d{4}$/)) {
      // Annual: '2024'
      const year = parseInt(period, 10);
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31);

      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      };
    }

    throw new Error(`Invalid period format: ${period}`);
  }

  /**
   * Validate VAT return form data
   */
  validateVATReturn(data: VATReturnData): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate totals
    const calculatedOutputVAT =
      data.sales.standardRate.vatAmount +
      data.sales.zeroRate.vatAmount +
      data.sales.reverseCharge.vatAmount +
      data.adjustments.outputVAT;

    if (Math.abs(calculatedOutputVAT - data.totals.totalOutputVAT) > 0.01) {
      errors.push(
        `Output VAT calculation mismatch: expected ${calculatedOutputVAT}, got ${data.totals.totalOutputVAT}`,
      );
    }

    const calculatedInputVAT =
      data.purchases.standardRate.vatAmount +
      data.purchases.zeroRate.vatAmount +
      data.purchases.reverseCharge.vatAmount +
      data.adjustments.inputVAT;

    if (Math.abs(calculatedInputVAT - data.totals.totalInputVAT) > 0.01) {
      errors.push(
        `Input VAT calculation mismatch: expected ${calculatedInputVAT}, got ${data.totals.totalInputVAT}`,
      );
    }

    // Warnings
    if (
      data.sales.standardRate.count === 0 &&
      data.purchases.standardRate.count === 0
    ) {
      warnings.push('No standard rate transactions found');
    }

    if (data.totals.netVATPayable < 0 && data.totals.refundable === 0) {
      warnings.push('Net VAT payable is negative but refundable is zero');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Create or update tax form
   */
  async createOrUpdateTaxForm(
    organizationId: string,
    formType: TaxFormType,
    period: string,
    formData: Record<string, any>,
    userId?: string,
  ): Promise<TaxForm> {
    // Check if form already exists
    const existing = await this.taxFormsRepository.findOne({
      where: {
        organization: { id: organizationId },
        formType,
        period,
        isDeleted: false,
      },
      order: { version: 'DESC' },
    });

    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (existing) {
      // Update existing form (create new version)
      existing.status = TaxFormStatus.DRAFT;
      existing.formData = formData;
      existing.generatedAt = new Date();
      if (userId) {
        existing.generatedBy = { id: userId } as any;
        existing.generatedById = userId;
      }
      existing.version += 1;
      return this.taxFormsRepository.save(existing);
    } else {
      // Create new form
      const taxForm = this.taxFormsRepository.create({
        organization,
        formType,
        region: organization.region as Region,
        period,
        formData,
        status: TaxFormStatus.DRAFT,
        generatedAt: new Date(),
        generatedBy: userId ? ({ id: userId } as any) : null,
        generatedById: userId || null,
        version: 1,
      });

      return this.taxFormsRepository.save(taxForm);
    }
  }

  /**
   * Get tax forms for organization
   */
  async getTaxForms(
    organizationId: string,
    formType?: TaxFormType,
    period?: string,
  ): Promise<TaxForm[]> {
    const query = this.taxFormsRepository
      .createQueryBuilder('form')
      .leftJoinAndSelect('form.generatedBy', 'generatedBy')
      .leftJoinAndSelect('form.filedBy', 'filedBy')
      .where('form.organization_id = :organizationId', { organizationId })
      .andWhere('form.is_deleted = false')
      .orderBy('form.period', 'DESC')
      .addOrderBy('form.version', 'DESC');

    if (formType) {
      query.andWhere('form.form_type = :formType', { formType });
    }

    if (period) {
      query.andWhere('form.period = :period', { period });
    }

    return query.getMany();
  }

  /**
   * Get tax form by ID
   */
  async getTaxFormById(id: string, organizationId: string): Promise<TaxForm> {
    const form = await this.taxFormsRepository.findOne({
      where: {
        id,
        organization: { id: organizationId },
        isDeleted: false,
      },
      relations: ['generatedBy', 'filedBy'],
    });

    if (!form) {
      throw new NotFoundException('Tax form not found');
    }

    return form;
  }

  /**
   * Mark form as filed
   */
  async markFormAsFiled(
    id: string,
    organizationId: string,
    filingReference: string,
    userId: string,
  ): Promise<TaxForm> {
    const form = await this.getTaxFormById(id, organizationId);

    form.status = TaxFormStatus.FILED;
    form.filedAt = new Date();
    form.filedBy = { id: userId } as any;
    form.filedById = userId;
    form.filingReference = filingReference;
    form.filingDate = new Date();

    return this.taxFormsRepository.save(form);
  }
}
