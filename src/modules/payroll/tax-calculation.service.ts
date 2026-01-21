import { Injectable } from '@nestjs/common';
import { SalaryComponent } from './entities/salary-component.entity';
import { SalaryComponentType } from '../../common/enums/salary-component-type.enum';

export interface TaxCalculationResult {
  taxableAmount: number;
  taxAmount: number;
  netAmount: number;
  breakdown: Array<{
    componentName: string;
    amount: number;
    taxable: boolean;
    taxAmount: number;
  }>;
}

@Injectable()
export class TaxCalculationService {
  /**
   * Calculate tax for UAE region
   * UAE currently has no personal income tax, but this can be extended for other regions
   */
  calculateTax(
    grossSalary: number,
    components: SalaryComponent[],
    region: string = 'UAE',
  ): TaxCalculationResult {
    if (region === 'UAE') {
      // UAE has no personal income tax
      return {
        taxableAmount: 0,
        taxAmount: 0,
        netAmount: grossSalary,
        breakdown: components.map((comp) => ({
          componentName: comp.name,
          amount: parseFloat(comp.amount || '0'),
          taxable: comp.isTaxable,
          taxAmount: 0,
        })),
      };
    }

    // For other regions, implement tax brackets
    return this.calculateTaxWithBrackets(grossSalary, components, region);
  }

  /**
   * Calculate tax using tax brackets (for future regions)
   */
  private calculateTaxWithBrackets(
    grossSalary: number,
    components: SalaryComponent[],
    region: string,
  ): TaxCalculationResult {
    // Get taxable components
    const taxableComponents = components.filter((c) => c.isTaxable);
    const taxableAmount = taxableComponents.reduce((sum, comp) => {
      const amount = parseFloat(comp.amount || '0');
      return sum + amount;
    }, 0);

    // Default: no tax (can be extended with region-specific brackets)
    const taxAmount = 0;

    // Example tax brackets (can be configured per region)
    // if (region === 'INDIA') {
    //   taxAmount = this.calculateIndiaTax(taxableAmount);
    // } else if (region === 'UK') {
    //   taxAmount = this.calculateUKTax(taxableAmount);
    // }

    const breakdown = components.map((comp) => {
      const amount = parseFloat(comp.amount || '0');
      const componentTax = comp.isTaxable
        ? (amount / taxableAmount) * taxAmount
        : 0;
      return {
        componentName: comp.name,
        amount,
        taxable: comp.isTaxable,
        taxAmount: componentTax,
      };
    });

    return {
      taxableAmount,
      taxAmount,
      netAmount: grossSalary - taxAmount,
      breakdown,
    };
  }

  /**
   * Calculate deductions (non-tax deductions like insurance, loans, etc.)
   */
  calculateDeductions(components: SalaryComponent[]): number {
    return components
      .filter((c) => c.componentType === SalaryComponentType.DEDUCTION)
      .reduce((sum, comp) => {
        const amount = parseFloat(comp.amount || '0');
        return sum + amount;
      }, 0);
  }

  /**
   * Get tax rate for a region (for future use)
   */
  getTaxRate(region: string, taxableAmount: number): number {
    if (region === 'UAE') {
      return 0; // No personal income tax in UAE
    }

    // Can be extended with region-specific tax rates
    return 0;
  }
}
