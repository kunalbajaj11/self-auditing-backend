import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaxRule, TaxRuleType, TaxRuleStatus } from '../../entities/tax-rule.entity';
import { TaxBracket } from '../../entities/tax-bracket.entity';
import { TaxExemption, ExemptionType } from '../../entities/tax-exemption.entity';
import { CategoryTaxRule } from '../../entities/category-tax-rule.entity';
import { Organization } from '../../entities/organization.entity';
import { Region } from '../../common/enums/region.enum';
import { Category } from '../../entities/category.entity';

export interface TaxCalculationInput {
  amount: number;
  organizationId: string;
  region?: Region;
  categoryId?: string;
  categoryName?: string;
  taxRate?: number; // Override rate if provided
  vatTaxType?: string; // 'standard', 'zero_rated', 'exempt', 'reverse_charge'
  calculationMethod?: 'inclusive' | 'exclusive';
  date?: Date; // For time-based rules
}

export interface TaxCalculationResult {
  baseAmount: number;
  vatAmount: number;
  effectiveTaxRate: number;
  appliedRules: string[]; // List of rules that were applied
  isReverseCharge: boolean;
  breakdown?: {
    bracketAmount?: number;
    bracketRate?: number;
    exemptionAmount?: number;
    categoryRate?: number;
  };
}

@Injectable()
export class TaxRulesService {
  private readonly logger = new Logger(TaxRulesService.name);

  constructor(
    @InjectRepository(TaxRule)
    private readonly taxRulesRepository: Repository<TaxRule>,
    @InjectRepository(TaxBracket)
    private readonly taxBracketsRepository: Repository<TaxBracket>,
    @InjectRepository(TaxExemption)
    private readonly taxExemptionsRepository: Repository<TaxExemption>,
    @InjectRepository(CategoryTaxRule)
    private readonly categoryTaxRulesRepository: Repository<CategoryTaxRule>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
  ) {}

  /**
   * Calculate tax using enhanced tax rules engine
   * This method applies tax brackets, exemptions, and category rules
   * Falls back to standard calculation if no rules are configured
   */
  async calculateTax(
    input: TaxCalculationInput,
  ): Promise<TaxCalculationResult> {
    const {
      amount,
      organizationId,
      region,
      categoryId,
      categoryName,
      taxRate,
      vatTaxType,
      calculationMethod = 'inclusive',
      date = new Date(),
    } = input;

    // Handle special tax types first (zero-rated, exempt, reverse charge)
    if (vatTaxType === 'zero_rated' || vatTaxType === 'exempt') {
      return {
        baseAmount: amount,
        vatAmount: 0,
        effectiveTaxRate: 0,
        appliedRules: [`${vatTaxType} tax type`],
        isReverseCharge: false,
      };
    }

    const isReverseCharge = vatTaxType === 'reverse_charge';

    // Get organization to determine region if not provided
    let effectiveRegion = region;
    if (!effectiveRegion) {
      const organization = await this.organizationsRepository.findOne({
        where: { id: organizationId },
        select: ['region'],
      });
      effectiveRegion = (organization?.region as Region) || Region.UAE;
    }

    // Get active tax rules for this organization and region
    const activeRules = await this.getActiveTaxRules(
      organizationId,
      effectiveRegion,
      date,
    );

    if (activeRules.length === 0 && !taxRate) {
      // No rules configured, fall back to standard calculation
      this.logger.debug(
        `No tax rules found for org ${organizationId}, using standard calculation`,
      );
      return this.calculateStandardTax(amount, 5, calculationMethod, isReverseCharge);
    }

    // Apply exemptions first
    const exemptionResult = await this.applyExemptions(
      amount,
      activeRules,
      categoryId,
      categoryName,
      date,
    );

    let taxableAmount = exemptionResult.taxableAmount;
    const appliedRules = exemptionResult.appliedRules;

    // Get effective tax rate
    let effectiveTaxRate: number;

    if (taxRate !== undefined) {
      // Use provided rate (highest priority)
      effectiveTaxRate = taxRate;
      appliedRules.push('manual tax rate override');
    } else {
      // Try category-specific rate
      const categoryRate = await this.getCategoryTaxRate(
        organizationId,
        categoryId,
        categoryName,
        date,
      );

      if (categoryRate !== null) {
        effectiveTaxRate = categoryRate;
        appliedRules.push('category-specific tax rate');
      } else {
        // Apply tax brackets if available
        const bracketResult = this.applyTaxBrackets(
          taxableAmount,
          activeRules,
          date,
        );

        if (bracketResult.rate !== null) {
          effectiveTaxRate = bracketResult.rate;
          appliedRules.push(...bracketResult.appliedRules);
        } else {
          // Fall back to default rate (5% for UAE, etc.)
          effectiveTaxRate = this.getDefaultTaxRateForRegion(effectiveRegion);
          appliedRules.push('default regional tax rate');
        }
      }
    }

    // Calculate VAT amount
    let vatAmount: number;
    let baseAmount: number;

    if (isReverseCharge) {
      // Reverse charge: VAT calculated but not added to total
      vatAmount = (taxableAmount * effectiveTaxRate) / 100;
      baseAmount = taxableAmount;
    } else if (calculationMethod === 'inclusive') {
      // Tax included in amount
      vatAmount = (taxableAmount * effectiveTaxRate) / (100 + effectiveTaxRate);
      baseAmount = taxableAmount - vatAmount;
    } else {
      // Tax exclusive (added on top)
      vatAmount = (taxableAmount * effectiveTaxRate) / 100;
      baseAmount = taxableAmount;
    }

    // Round VAT amount
    vatAmount = Math.round(vatAmount * 100) / 100;

    // Recalculate base for inclusive to ensure consistency
    if (calculationMethod === 'inclusive' && !isReverseCharge) {
      baseAmount = taxableAmount - vatAmount;
    }

    return {
      baseAmount,
      vatAmount,
      effectiveTaxRate,
      appliedRules,
      isReverseCharge,
      breakdown: {
        exemptionAmount: amount - taxableAmount,
      },
    };
  }

  /**
   * Get active tax rules for organization and region
   */
  private async getActiveTaxRules(
    organizationId: string,
    region: Region,
    date: Date,
  ): Promise<TaxRule[]> {
    const query = this.taxRulesRepository
      .createQueryBuilder('rule')
      .leftJoinAndSelect('rule.brackets', 'brackets')
      .leftJoinAndSelect('rule.exemptions', 'exemptions')
      .leftJoinAndSelect('exemptions.category', 'exemptionCategory')
      .leftJoinAndSelect('rule.categoryRules', 'categoryRules')
      .leftJoinAndSelect('categoryRules.category', 'categoryRuleCategory')
      .where('rule.organization_id = :organizationId', { organizationId })
      .andWhere('rule.is_active = true')
      .andWhere(
        '(rule.region = :region OR rule.region IS NULL)',
        { region },
      )
      .andWhere(
        '(rule.effective_date IS NULL OR rule.effective_date <= :date)',
        { date },
      )
      .andWhere(
        '(rule.expiry_date IS NULL OR rule.expiry_date >= :date)',
        { date },
      )
      .orderBy('rule.priority', 'DESC')
      .addOrderBy('rule.created_at', 'DESC');

    return query.getMany();
  }

  /**
   * Apply tax exemptions
   */
  private async applyExemptions(
    amount: number,
    rules: TaxRule[],
    categoryId?: string,
    categoryName?: string,
    date?: Date,
  ): Promise<{
    taxableAmount: number;
    appliedRules: string[];
  }> {
    let taxableAmount = amount;
    const appliedRules: string[] = [];

    // Get exemption rules
    const exemptionRules = rules.filter(
      (r) => r.ruleType === TaxRuleType.EXEMPTION,
    );

    for (const rule of exemptionRules) {
      if (!rule.exemptions || rule.exemptions.length === 0) continue;

      for (const exemption of rule.exemptions) {
        let shouldApply = false;

        switch (exemption.exemptionType) {
          case ExemptionType.FULL:
            // Full exemption - check if category matches
            if (categoryId && exemption.categoryId === categoryId) {
              shouldApply = true;
            } else if (
              categoryName &&
              exemption.category?.name === categoryName
            ) {
              shouldApply = true;
            }
            break;

          case ExemptionType.AMOUNT_THRESHOLD:
            // Exempt if amount is below threshold
            if (
              exemption.thresholdAmount &&
              amount <= parseFloat(exemption.thresholdAmount)
            ) {
              shouldApply = true;
            }
            break;

          case ExemptionType.CATEGORY:
            // Category-based exemption
            if (categoryId && exemption.categoryId === categoryId) {
              shouldApply = true;
            } else if (
              categoryName &&
              exemption.category?.name === categoryName
            ) {
              shouldApply = true;
            }
            break;
        }

        if (shouldApply) {
          if (exemption.exemptionType === ExemptionType.FULL) {
            taxableAmount = 0;
            appliedRules.push(
              `Full exemption: ${rule.ruleName} - ${exemption.description || 'Category exemption'}`,
            );
            return { taxableAmount, appliedRules }; // Full exemption, no further processing
          } else if (exemption.exemptionPercentage) {
            // Partial exemption by percentage
            const exemptAmount =
              (amount * parseFloat(exemption.exemptionPercentage)) / 100;
            taxableAmount -= exemptAmount;
            appliedRules.push(
              `Partial exemption (${exemption.exemptionPercentage}%): ${rule.ruleName}`,
            );
          } else if (exemption.exemptionAmount) {
            // Partial exemption by fixed amount
            const exemptAmount = parseFloat(exemption.exemptionAmount);
            taxableAmount -= exemptAmount;
            appliedRules.push(
              `Partial exemption (${exemptAmount}): ${rule.ruleName}`,
            );
          }
        }
      }
    }

    // Ensure taxable amount is not negative
    taxableAmount = Math.max(0, taxableAmount);

    return { taxableAmount, appliedRules };
  }

  /**
   * Apply tax brackets (progressive taxation)
   */
  private applyTaxBrackets(
    amount: number,
    rules: TaxRule[],
    date?: Date,
  ): {
    rate: number | null;
    appliedRules: string[];
  } {
    const bracketRules = rules.filter(
      (r) => r.ruleType === TaxRuleType.BRACKET,
    );

    if (bracketRules.length === 0) {
      return { rate: null, appliedRules: [] };
    }

    // Get the highest priority bracket rule
    const bracketRule = bracketRules[0];

    if (!bracketRule.brackets || bracketRule.brackets.length === 0) {
      return { rate: null, appliedRules: [] };
    }

    // Sort brackets by minAmount
    const sortedBrackets = [...bracketRule.brackets].sort((a, b) => {
      const aMin = parseFloat(a.minAmount);
      const bMin = parseFloat(b.minAmount);
      return aMin - bMin;
    });

    // Find the applicable bracket
    for (const bracket of sortedBrackets) {
      const minAmount = parseFloat(bracket.minAmount);
      const maxAmount = bracket.maxAmount
        ? parseFloat(bracket.maxAmount)
        : Infinity;

      if (amount >= minAmount && amount <= maxAmount) {
        return {
          rate: parseFloat(bracket.rate),
          appliedRules: [
            `Tax bracket: ${bracket.rate}% (${minAmount} - ${maxAmount === Infinity ? '∞' : maxAmount})`,
          ],
        };
      }
    }

    // If no bracket matches, use the highest bracket rate
    const highestBracket = sortedBrackets[sortedBrackets.length - 1];
    return {
      rate: parseFloat(highestBracket.rate),
      appliedRules: [
        `Tax bracket (highest rate): ${highestBracket.rate}%`,
      ],
    };
  }

  /**
   * Get category-specific tax rate
   */
  private async getCategoryTaxRate(
    organizationId: string,
    categoryId?: string,
    categoryName?: string,
    date?: Date,
  ): Promise<number | null> {
    if (!categoryId && !categoryName) {
      return null;
    }

    const query = this.categoryTaxRulesRepository
      .createQueryBuilder('categoryRule')
      .leftJoinAndSelect('categoryRule.category', 'category')
      .leftJoinAndSelect('categoryRule.taxRule', 'taxRule')
      .where('taxRule.organization_id = :organizationId', { organizationId })
      .andWhere('categoryRule.is_active = true')
      .andWhere('taxRule.is_active = true')
      .andWhere(
        '(taxRule.effective_date IS NULL OR taxRule.effective_date <= :date)',
        { date: date || new Date() },
      )
      .andWhere(
        '(taxRule.expiry_date IS NULL OR taxRule.expiry_date >= :date)',
        { date: date || new Date() },
      )
      .orderBy('taxRule.priority', 'DESC');

    if (categoryId) {
      query.andWhere('categoryRule.category_id = :categoryId', { categoryId });
    } else if (categoryName) {
      query.andWhere('category.name = :categoryName', { categoryName });
    }

    const categoryRule = await query.getOne();

    if (categoryRule) {
      return parseFloat(categoryRule.rate);
    }

    return null;
  }

  /**
   * Calculate standard tax (fallback when no rules are configured)
   */
  private calculateStandardTax(
    amount: number,
    rate: number,
    calculationMethod: 'inclusive' | 'exclusive',
    isReverseCharge: boolean,
  ): TaxCalculationResult {
    let vatAmount: number;
    let baseAmount: number;

    if (isReverseCharge) {
      vatAmount = (amount * rate) / 100;
      baseAmount = amount;
    } else if (calculationMethod === 'inclusive') {
      vatAmount = (amount * rate) / (100 + rate);
      baseAmount = amount - vatAmount;
    } else {
      vatAmount = (amount * rate) / 100;
      baseAmount = amount;
    }

    vatAmount = Math.round(vatAmount * 100) / 100;

    if (calculationMethod === 'inclusive' && !isReverseCharge) {
      baseAmount = amount - vatAmount;
    }

    return {
      baseAmount,
      vatAmount,
      effectiveTaxRate: rate,
      appliedRules: ['standard tax calculation'],
      isReverseCharge,
    };
  }

  /**
   * Get default tax rate for region
   */
  private getDefaultTaxRateForRegion(region: Region): number {
    const defaultRates: Record<Region, number> = {
      [Region.UAE]: 5,
      [Region.SAUDI]: 15,
      [Region.OMAN]: 5,
      [Region.KUWAIT]: 5,
      [Region.BAHRAIN]: 10,
      [Region.QATAR]: 5,
      [Region.INDIA]: 18,
    };

    return defaultRates[region] || 5;
  }

  // CRUD Operations

  /**
   * Get all tax rules for organization
   */
  async getTaxRules(organizationId: string): Promise<TaxRule[]> {
    return this.taxRulesRepository.find({
      where: { organization: { id: organizationId } },
      relations: ['brackets', 'exemptions', 'exemptions.category', 'categoryRules', 'categoryRules.category'],
      order: { priority: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * Create a new tax rule
   */
  async createTaxRule(
    organizationId: string,
    dto: any,
  ): Promise<TaxRule> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    const taxRule = this.taxRulesRepository.create({
      organization,
      region: dto.region || null,
      ruleType: dto.ruleType,
      ruleName: dto.ruleName,
      description: dto.description,
      ruleConfig: dto.ruleConfig || {},
      effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : null,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      priority: dto.priority || 0,
    });

    return this.taxRulesRepository.save(taxRule);
  }

  /**
   * Update a tax rule
   */
  async updateTaxRule(
    organizationId: string,
    id: string,
    dto: Partial<any>,
  ): Promise<TaxRule> {
    const taxRule = await this.taxRulesRepository.findOne({
      where: { id, organization: { id: organizationId } },
    });

    if (!taxRule) {
      throw new Error('Tax rule not found');
    }

    if (dto.region !== undefined) taxRule.region = dto.region;
    if (dto.ruleType !== undefined) taxRule.ruleType = dto.ruleType;
    if (dto.ruleName !== undefined) taxRule.ruleName = dto.ruleName;
    if (dto.description !== undefined) taxRule.description = dto.description;
    if (dto.ruleConfig !== undefined) taxRule.ruleConfig = dto.ruleConfig;
    if (dto.effectiveDate !== undefined)
      taxRule.effectiveDate = dto.effectiveDate ? new Date(dto.effectiveDate) : null;
    if (dto.expiryDate !== undefined)
      taxRule.expiryDate = dto.expiryDate ? new Date(dto.expiryDate) : null;
    if (dto.isActive !== undefined) taxRule.isActive = dto.isActive;
    if (dto.priority !== undefined) taxRule.priority = dto.priority;

    return this.taxRulesRepository.save(taxRule);
  }

  /**
   * Delete a tax rule
   */
  async deleteTaxRule(organizationId: string, id: string): Promise<void> {
    const taxRule = await this.taxRulesRepository.findOne({
      where: { id, organization: { id: organizationId } },
    });

    if (!taxRule) {
      throw new Error('Tax rule not found');
    }

    await this.taxRulesRepository.remove(taxRule);
  }

  /**
   * Add a tax bracket to a tax rule
   */
  async addTaxBracket(
    organizationId: string,
    ruleId: string,
    dto: any,
  ): Promise<TaxBracket> {
    const taxRule = await this.taxRulesRepository.findOne({
      where: { id: ruleId, organization: { id: organizationId } },
    });

    if (!taxRule) {
      throw new Error('Tax rule not found');
    }

    const bracket = this.taxBracketsRepository.create({
      taxRule,
      minAmount: dto.minAmount.toString(),
      maxAmount: dto.maxAmount?.toString() || null,
      rate: dto.rate.toString(),
      description: dto.description,
      bracketOrder: dto.bracketOrder || 0,
    });

    return this.taxBracketsRepository.save(bracket);
  }

  /**
   * Add a tax exemption to a tax rule
   */
  async addTaxExemption(
    organizationId: string,
    ruleId: string,
    dto: any,
  ): Promise<TaxExemption> {
    const taxRule = await this.taxRulesRepository.findOne({
      where: { id: ruleId, organization: { id: organizationId } },
    });

    if (!taxRule) {
      throw new Error('Tax rule not found');
    }

    let category: Category | null = null;
    if (dto.categoryId) {
      category = await this.categoriesRepository.findOne({
        where: { id: dto.categoryId, organization: { id: organizationId } },
      });
      if (!category) {
        throw new Error('Category not found');
      }
    }

    const exemption = this.taxExemptionsRepository.create({
      taxRule,
      exemptionType: dto.exemptionType,
      category: category || undefined,
      categoryId: dto.categoryId || null,
      exemptionAmount: dto.exemptionAmount?.toString() || null,
      exemptionPercentage: dto.exemptionPercentage?.toString() || null,
      thresholdAmount: dto.thresholdAmount?.toString() || null,
      description: dto.description,
    });

    return this.taxExemptionsRepository.save(exemption);
  }

  /**
   * Add a category tax rule to a tax rule
   */
  async addCategoryTaxRule(
    organizationId: string,
    ruleId: string,
    dto: any,
  ): Promise<CategoryTaxRule> {
    const taxRule = await this.taxRulesRepository.findOne({
      where: { id: ruleId, organization: { id: organizationId } },
    });

    if (!taxRule) {
      throw new Error('Tax rule not found');
    }

    const category = await this.categoriesRepository.findOne({
      where: { id: dto.categoryId, organization: { id: organizationId } },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    const categoryRule = this.categoryTaxRulesRepository.create({
      taxRule,
      category,
      categoryId: dto.categoryId,
      rate: dto.rate.toString(),
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      description: dto.description,
    });

    return this.categoryTaxRulesRepository.save(categoryRule);
  }
}

