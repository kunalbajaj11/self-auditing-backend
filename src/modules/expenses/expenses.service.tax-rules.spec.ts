import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExpensesService } from './expenses.service';
import { TaxRulesService } from '../tax-rules/tax-rules.service';
import { Expense } from '../../entities/expense.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { Category } from '../../entities/category.entity';
import { Attachment } from '../../entities/attachment.entity';
import { Accrual } from '../../entities/accrual.entity';
import { PurchaseLineItem } from '../../entities/purchase-line-item.entity';
import { ExpensePayment } from '../../entities/expense-payment.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { FileStorageService } from '../attachments/file-storage.service';
import { DuplicateDetectionService } from '../duplicates/duplicate-detection.service';
import { ForexRateService } from '../forex/forex-rate.service';
import { LicenseKeysService } from '../license-keys/license-keys.service';
import { SettingsService } from '../settings/settings.service';
import { InventoryService } from '../inventory/inventory.service';
import { Vendor } from '../vendors/vendor.entity';
import { Product } from '../products/product.entity';
import { Region } from '../../common/enums/region.enum';

describe('ExpensesService - Tax Rules Integration', () => {
  let service: ExpensesService;
  let taxRulesService: TaxRulesService;
  let expensesRepository: Repository<Expense>;
  let organizationsRepository: Repository<Organization>;
  let categoriesRepository: Repository<Category>;

  const mockOrganizationId = 'org-123';
  const mockUserId = 'user-123';
  const mockCategoryId = 'cat-123';

  beforeEach(async () => {
    const mockTaxRulesService = { calculateTax: jest.fn() };
    const mockSettingsService = {
      getTaxSettings: jest
        .fn()
        .mockResolvedValue({ taxCalculationMethod: 'inclusive' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        {
          provide: TaxRulesService,
          useValue: mockTaxRulesService,
        },
        {
          provide: getRepositoryToken(Expense),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Organization),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Category),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Attachment),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Accrual),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Vendor),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Product),
          useValue: {},
        },
        {
          provide: getRepositoryToken(PurchaseLineItem),
          useValue: {},
        },
        {
          provide: getRepositoryToken(ExpensePayment),
          useValue: {},
        },
        { provide: NotificationsService, useValue: {} },
        { provide: FileStorageService, useValue: {} },
        { provide: DuplicateDetectionService, useValue: {} },
        { provide: ForexRateService, useValue: {} },
        { provide: LicenseKeysService, useValue: {} },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: InventoryService, useValue: {} },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
    taxRulesService = module.get<TaxRulesService>(TaxRulesService);
    expensesRepository = module.get<Repository<Expense>>(
      getRepositoryToken(Expense),
    );
    organizationsRepository = module.get<Repository<Organization>>(
      getRepositoryToken(Organization),
    );
    categoriesRepository = module.get<Repository<Category>>(
      getRepositoryToken(Category),
    );
  });

  describe('calculateVatAmount - Tax Rules Integration', () => {
    it('should use tax rules service when available', async () => {
      const mockCategory: Category = {
        id: mockCategoryId,
        name: 'Test Category',
      } as Category;

      jest.spyOn(organizationsRepository, 'findOne').mockResolvedValue({
        id: mockOrganizationId,
        region: Region.UAE,
      } as any);

      jest.spyOn(taxRulesService, 'calculateTax').mockResolvedValue({
        baseAmount: 95.24,
        vatAmount: 4.76,
        effectiveTaxRate: 5,
        appliedRules: ['category-specific tax rate'],
        isReverseCharge: false,
      });

      // Access private method via reflection or make it protected
      // For now, test through public methods that use it
      const result = await (service as any).calculateVatAmount(
        mockOrganizationId,
        100,
        5,
        'standard',
        mockCategoryId,
        'Test Category',
      );

      expect(taxRulesService.calculateTax).toHaveBeenCalledWith({
        amount: 100,
        organizationId: mockOrganizationId,
        region: Region.UAE,
        categoryId: mockCategoryId,
        categoryName: 'Test Category',
        taxRate: 5,
        vatTaxType: 'standard',
        calculationMethod: 'inclusive',
      });

      expect(result.vatAmount).toBe(4.76);
      expect(result.baseAmount).toBe(95.24);
    });

    it('should fall back to standard calculation when tax rules service fails', async () => {
      jest.spyOn(organizationsRepository, 'findOne').mockResolvedValue({
        id: mockOrganizationId,
        region: Region.UAE,
      } as any);

      jest
        .spyOn(taxRulesService, 'calculateTax')
        .mockRejectedValue(new Error('Tax rules service error'));

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await (service as any).calculateVatAmount(
        mockOrganizationId,
        100,
        5,
        'standard',
      );

      // Should fall back to standard calculation
      expect(result.vatAmount).toBeCloseTo(4.76, 2);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tax rules service error'),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('should fall back to standard calculation when tax rules service is not available', async () => {
      // Create service without tax rules service
      const moduleWithoutTaxRules: TestingModule =
        await Test.createTestingModule({
          providers: [
            ExpensesService,
            // TaxRulesService not provided
            {
              provide: getRepositoryToken(Expense),
              useValue: {
                create: jest.fn(),
                save: jest.fn(),
                findOne: jest.fn(),
              },
            },
            {
              provide: getRepositoryToken(Organization),
              useValue: {
                findOne: jest.fn().mockResolvedValue({
                  id: mockOrganizationId,
                  region: Region.UAE,
                } as any),
              },
            },
            { provide: getRepositoryToken(User), useValue: {} },
            { provide: getRepositoryToken(Category), useValue: {} },
            { provide: getRepositoryToken(Attachment), useValue: {} },
            { provide: getRepositoryToken(Accrual), useValue: {} },
            { provide: getRepositoryToken(Vendor), useValue: {} },
            { provide: getRepositoryToken(Product), useValue: {} },
            { provide: getRepositoryToken(PurchaseLineItem), useValue: {} },
            { provide: getRepositoryToken(ExpensePayment), useValue: {} },
            { provide: NotificationsService, useValue: {} },
            { provide: FileStorageService, useValue: {} },
            { provide: DuplicateDetectionService, useValue: {} },
            { provide: ForexRateService, useValue: {} },
            { provide: LicenseKeysService, useValue: {} },
            {
              provide: SettingsService,
              useValue: {
                getTaxSettings: jest
                  .fn()
                  .mockResolvedValue({ taxCalculationMethod: 'inclusive' }),
              },
            },
            { provide: InventoryService, useValue: {} },
          ],
        }).compile();

      const serviceWithoutTaxRules =
        moduleWithoutTaxRules.get<ExpensesService>(ExpensesService);

      const result = await (serviceWithoutTaxRules as any).calculateVatAmount(
        mockOrganizationId,
        100,
        5,
        'standard',
      );

      // Should use standard calculation
      expect(result.vatAmount).toBeCloseTo(4.76, 2);
      expect(result.baseAmount).toBeCloseTo(95.24, 2);
    });
  });
});
