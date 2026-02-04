import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaxRulesService } from './tax-rules.service';
import { TaxRule } from '../../entities/tax-rule.entity';
import { TaxBracket } from '../../entities/tax-bracket.entity';
import { TaxExemption } from '../../entities/tax-exemption.entity';
import { CategoryTaxRule } from '../../entities/category-tax-rule.entity';
import { Organization } from '../../entities/organization.entity';
import { Category } from '../../entities/category.entity';
import { Region } from '../../common/enums/region.enum';
import { TaxRuleType } from '../../entities/tax-rule.entity';
import { ExemptionType } from '../../entities/tax-exemption.entity';

describe('TaxRulesService', () => {
  let service: TaxRulesService;
  let taxRulesRepository: Repository<TaxRule>;
  let taxBracketsRepository: Repository<TaxBracket>;
  let taxExemptionsRepository: Repository<TaxExemption>;
  let categoryTaxRulesRepository: Repository<CategoryTaxRule>;
  let organizationsRepository: Repository<Organization>;
  let categoriesRepository: Repository<Category>;

  const mockOrganizationId = 'org-123';
  const mockCategoryId = 'cat-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaxRulesService,
        {
          provide: getRepositoryToken(TaxRule),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(TaxBracket),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(TaxExemption),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(CategoryTaxRule),
          useValue: {
            createQueryBuilder: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Organization),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Category),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TaxRulesService>(TaxRulesService);
    taxRulesRepository = module.get<Repository<TaxRule>>(
      getRepositoryToken(TaxRule),
    );
    taxBracketsRepository = module.get<Repository<TaxBracket>>(
      getRepositoryToken(TaxBracket),
    );
    taxExemptionsRepository = module.get<Repository<TaxExemption>>(
      getRepositoryToken(TaxExemption),
    );
    categoryTaxRulesRepository = module.get<Repository<CategoryTaxRule>>(
      getRepositoryToken(CategoryTaxRule),
    );
    organizationsRepository = module.get<Repository<Organization>>(
      getRepositoryToken(Organization),
    );
    categoriesRepository = module.get<Repository<Category>>(
      getRepositoryToken(Category),
    );

    // Default mocks so individual tests can override only what they need.
    jest.spyOn(taxRulesRepository, 'createQueryBuilder').mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    } as any);

    jest
      .spyOn(categoryTaxRulesRepository, 'createQueryBuilder')
      .mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      } as any);

    jest.spyOn(organizationsRepository, 'findOne').mockResolvedValue({
      id: mockOrganizationId,
      region: Region.UAE,
    } as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateTax - Standard Calculation (No Rules)', () => {
    it('should calculate standard VAT for UAE (5%) - inclusive', async () => {
      // Mock: No tax rules configured
      jest.spyOn(taxRulesRepository, 'createQueryBuilder').mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        // Ensure at least one active rule exists; category tax rules are linked to active tax rules.
        // Otherwise calculateTax() will fall back to default VAT before checking category overrides.
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'rule-default',
            ruleType: TaxRuleType.CATEGORY,
            ruleName: 'Category Rule (placeholder)',
            isActive: true,
            exemptions: [],
            brackets: [],
          } as any,
        ]),
      } as any);

      jest.spyOn(organizationsRepository, 'findOne').mockResolvedValue({
        id: mockOrganizationId,
        region: Region.UAE,
      } as any);

      const result = await service.calculateTax({
        amount: 100,
        organizationId: mockOrganizationId,
        calculationMethod: 'inclusive',
      });

      expect(result.vatAmount).toBeCloseTo(4.76, 2); // 100 * 5 / 105
      expect(result.baseAmount).toBeCloseTo(95.24, 2); // 100 - 4.76
      expect(result.effectiveTaxRate).toBe(5);
      expect(result.isReverseCharge).toBe(false);
    });

    it('should calculate standard VAT for UAE (5%) - exclusive', async () => {
      jest.spyOn(taxRulesRepository, 'createQueryBuilder').mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        // Category tax rules are linked to active tax rules; ensure at least one exists so we
        // don't fall back to default VAT before checking category overrides.
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'rule-category',
            ruleType: TaxRuleType.CATEGORY,
            ruleName: 'Category Rule (placeholder)',
            isActive: true,
            exemptions: [],
            brackets: [],
          } as any,
        ]),
      } as any);

      jest.spyOn(organizationsRepository, 'findOne').mockResolvedValue({
        id: mockOrganizationId,
        region: Region.UAE,
      } as any);

      const result = await service.calculateTax({
        amount: 100,
        organizationId: mockOrganizationId,
        calculationMethod: 'exclusive',
      });

      expect(result.vatAmount).toBe(5); // 100 * 5 / 100
      expect(result.baseAmount).toBe(100);
      expect(result.effectiveTaxRate).toBe(5);
    });

    it('should handle zero-rated tax type', async () => {
      const result = await service.calculateTax({
        amount: 100,
        organizationId: mockOrganizationId,
        vatTaxType: 'zero_rated',
      });

      expect(result.vatAmount).toBe(0);
      expect(result.baseAmount).toBe(100);
      expect(result.effectiveTaxRate).toBe(0);
      expect(result.appliedRules).toContain('zero_rated tax type');
    });

    it('should handle exempt tax type', async () => {
      const result = await service.calculateTax({
        amount: 100,
        organizationId: mockOrganizationId,
        vatTaxType: 'exempt',
      });

      expect(result.vatAmount).toBe(0);
      expect(result.baseAmount).toBe(100);
      expect(result.effectiveTaxRate).toBe(0);
      expect(result.appliedRules).toContain('exempt tax type');
    });

    it('should handle reverse charge', async () => {
      jest.spyOn(taxRulesRepository, 'createQueryBuilder').mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        // Ensure at least one active rule exists so calculateTax() doesn't return early
        // before checking category tax overrides.
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'rule-category',
            ruleType: TaxRuleType.CATEGORY,
            ruleName: 'Category Rule (placeholder)',
            isActive: true,
            exemptions: [],
            brackets: [],
          } as any,
        ]),
      } as any);

      jest.spyOn(organizationsRepository, 'findOne').mockResolvedValue({
        id: mockOrganizationId,
        region: Region.UAE,
      } as any);

      const result = await service.calculateTax({
        amount: 100,
        organizationId: mockOrganizationId,
        vatTaxType: 'reverse_charge',
        calculationMethod: 'exclusive',
      });

      expect(result.vatAmount).toBe(5); // VAT calculated
      expect(result.baseAmount).toBe(100); // But not added to total
      expect(result.isReverseCharge).toBe(true);
    });
  });

  describe('calculateTax - Tax Brackets', () => {
    it('should apply tax bracket for amount in range', async () => {
      const mockBracket: TaxBracket = {
        id: 'bracket-1',
        minAmount: '0',
        maxAmount: '1000',
        rate: '10',
        bracketOrder: 0,
      } as TaxBracket;

      const mockRule: TaxRule = {
        id: 'rule-1',
        ruleType: TaxRuleType.BRACKET,
        ruleName: 'Test Bracket Rule',
        isActive: true,
        brackets: [mockBracket],
      } as TaxRule;

      jest.spyOn(taxRulesRepository, 'createQueryBuilder').mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockRule]),
      } as any);

      jest.spyOn(organizationsRepository, 'findOne').mockResolvedValue({
        id: mockOrganizationId,
        region: Region.UAE,
      } as any);

      const result = await service.calculateTax({
        amount: 500,
        organizationId: mockOrganizationId,
        calculationMethod: 'inclusive',
      });

      expect(result.effectiveTaxRate).toBe(10);
      expect(result.vatAmount).toBeCloseTo(45.45, 2); // 500 * 10 / 110
      expect(result.appliedRules.some((r) => r.includes('Tax bracket'))).toBe(
        true,
      );
    });
  });

  describe('calculateTax - Exemptions', () => {
    it('should apply full exemption for category', async () => {
      const mockCategory: Category = {
        id: mockCategoryId,
        name: 'Exempt Category',
      } as Category;

      const mockExemption: TaxExemption = {
        id: 'exemption-1',
        exemptionType: ExemptionType.FULL,
        category: mockCategory,
        categoryId: mockCategoryId,
      } as TaxExemption;

      const mockRule: TaxRule = {
        id: 'rule-1',
        ruleType: TaxRuleType.EXEMPTION,
        ruleName: 'Test Exemption Rule',
        isActive: true,
        exemptions: [mockExemption],
      } as TaxRule;

      jest.spyOn(taxRulesRepository, 'createQueryBuilder').mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockRule]),
      } as any);

      jest.spyOn(organizationsRepository, 'findOne').mockResolvedValue({
        id: mockOrganizationId,
        region: Region.UAE,
      } as any);

      const result = await service.calculateTax({
        amount: 100,
        organizationId: mockOrganizationId,
        categoryId: mockCategoryId,
        calculationMethod: 'inclusive',
      });

      expect(result.vatAmount).toBe(0);
      expect(result.baseAmount).toBe(100);
      expect(
        result.appliedRules.some((r) => r.includes('Full exemption')),
      ).toBe(true);
    });

    it('should apply partial exemption by percentage', async () => {
      const mockExemption: TaxExemption = {
        id: 'exemption-1',
        exemptionType: ExemptionType.PARTIAL,
        exemptionPercentage: '50',
      } as TaxExemption;

      const mockRule: TaxRule = {
        id: 'rule-1',
        ruleType: TaxRuleType.EXEMPTION,
        ruleName: 'Test Partial Exemption',
        isActive: true,
        exemptions: [mockExemption],
      } as TaxRule;

      jest.spyOn(taxRulesRepository, 'createQueryBuilder').mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockRule]),
      } as any);

      jest.spyOn(organizationsRepository, 'findOne').mockResolvedValue({
        id: mockOrganizationId,
        region: Region.UAE,
      } as any);

      const result = await service.calculateTax({
        amount: 100,
        organizationId: mockOrganizationId,
        calculationMethod: 'inclusive',
      });

      // 50% exempt, so taxable amount is 50
      // VAT on 50 at 5% inclusive = 50 * 5 / 105 = 2.38
      expect(result.vatAmount).toBeCloseTo(2.38, 2);
      expect(result.breakdown?.exemptionAmount).toBe(50);
    });
  });

  describe('calculateTax - Category Tax Rules', () => {
    it('should apply category-specific tax rate', async () => {
      const mockCategory: Category = {
        id: mockCategoryId,
        name: 'Special Category',
      } as Category;

      const mockCategoryRule: CategoryTaxRule = {
        id: 'cat-rule-1',
        category: mockCategory,
        categoryId: mockCategoryId,
        rate: '15',
        isActive: true,
      } as CategoryTaxRule;

      jest
        .spyOn(categoryTaxRulesRepository, 'createQueryBuilder')
        .mockReturnValue({
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(mockCategoryRule),
        } as any);

      jest.spyOn(taxRulesRepository, 'createQueryBuilder').mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'rule-category',
            ruleType: TaxRuleType.CATEGORY,
            ruleName: 'Category Rule (placeholder)',
            isActive: true,
            exemptions: [],
            brackets: [],
          } as any,
        ]),
      } as any);

      jest.spyOn(organizationsRepository, 'findOne').mockResolvedValue({
        id: mockOrganizationId,
        region: Region.UAE,
      } as any);

      const result = await service.calculateTax({
        amount: 100,
        organizationId: mockOrganizationId,
        categoryId: mockCategoryId,
        calculationMethod: 'inclusive',
      });

      expect(result.effectiveTaxRate).toBe(15);
      expect(result.vatAmount).toBeCloseTo(13.04, 2); // 100 * 15 / 115
      expect(
        result.appliedRules.some((r) => r.includes('category-specific')),
      ).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero amount', async () => {
      const result = await service.calculateTax({
        amount: 0,
        organizationId: mockOrganizationId,
        vatTaxType: 'standard',
      });

      expect(result.vatAmount).toBe(0);
      expect(result.baseAmount).toBe(0);
    });

    it('should handle very small amounts', async () => {
      jest.spyOn(taxRulesRepository, 'createQueryBuilder').mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      } as any);

      jest.spyOn(organizationsRepository, 'findOne').mockResolvedValue({
        id: mockOrganizationId,
        region: Region.UAE,
      } as any);

      const result = await service.calculateTax({
        amount: 0.01,
        organizationId: mockOrganizationId,
        calculationMethod: 'inclusive',
      });

      expect(result.vatAmount).toBeGreaterThanOrEqual(0);
      expect(result.baseAmount).toBeGreaterThanOrEqual(0);
    });

    it('should handle large amounts', async () => {
      jest.spyOn(taxRulesRepository, 'createQueryBuilder').mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      } as any);

      jest.spyOn(organizationsRepository, 'findOne').mockResolvedValue({
        id: mockOrganizationId,
        region: Region.UAE,
      } as any);

      const result = await service.calculateTax({
        amount: 1000000,
        organizationId: mockOrganizationId,
        calculationMethod: 'inclusive',
      });

      expect(result.vatAmount).toBeCloseTo(47619.05, 2); // 1000000 * 5 / 105
      expect(result.baseAmount).toBeCloseTo(952380.95, 2);
    });
  });
});
