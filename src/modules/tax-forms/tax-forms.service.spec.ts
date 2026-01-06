import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaxFormsService } from './tax-forms.service';
import { TaxForm, TaxFormType, TaxFormStatus } from '../../entities/tax-form.entity';
import { Organization } from '../../entities/organization.entity';
import { Expense } from '../../entities/expense.entity';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { Region } from '../../common/enums/region.enum';

describe('TaxFormsService', () => {
  let service: TaxFormsService;
  let taxFormsRepository: Repository<TaxForm>;
  let organizationsRepository: Repository<Organization>;
  let expensesRepository: Repository<Expense>;
  let salesInvoicesRepository: Repository<SalesInvoice>;

  const mockTaxFormsRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockOrganizationsRepository = {
    findOne: jest.fn(),
  };

  const mockExpensesRepository = {
    createQueryBuilder: jest.fn(),
  };

  const mockSalesInvoicesRepository = {
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaxFormsService,
        {
          provide: getRepositoryToken(TaxForm),
          useValue: mockTaxFormsRepository,
        },
        {
          provide: getRepositoryToken(Organization),
          useValue: mockOrganizationsRepository,
        },
        {
          provide: getRepositoryToken(Expense),
          useValue: mockExpensesRepository,
        },
        {
          provide: getRepositoryToken(SalesInvoice),
          useValue: mockSalesInvoicesRepository,
        },
      ],
    }).compile();

    service = module.get<TaxFormsService>(TaxFormsService);
    taxFormsRepository = module.get<Repository<TaxForm>>(
      getRepositoryToken(TaxForm),
    );
    organizationsRepository = module.get<Repository<Organization>>(
      getRepositoryToken(Organization),
    );
    expensesRepository = module.get<Repository<Expense>>(
      getRepositoryToken(Expense),
    );
    salesInvoicesRepository = module.get<Repository<SalesInvoice>>(
      getRepositoryToken(SalesInvoice),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('extractVATReturnData', () => {
    it('should extract VAT return data correctly', async () => {
      const organizationId = 'org-1';
      const period = '2024-01';

      const mockOrganization = {
        id: organizationId,
        name: 'Test Org',
        vatNumber: 'VAT123',
        region: Region.UAE,
      };

      const mockInvoices = [
        {
          baseAmount: '1000',
          amount: '1000',
          vatAmount: '50',
          vatTaxType: 'standard',
        },
        {
          baseAmount: '500',
          amount: '500',
          vatAmount: '0',
          vatTaxType: 'zero_rated',
        },
      ];

      const mockExpenses = [
        {
          baseAmount: '800',
          amount: '800',
          vatAmount: '40',
          vatTaxType: 'standard',
        },
      ];

      mockOrganizationsRepository.findOne.mockResolvedValue(mockOrganization);

      const mockInvoiceQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockInvoices),
      };

      const mockExpenseQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockExpenses),
      };

      mockSalesInvoicesRepository.createQueryBuilder.mockReturnValue(
        mockInvoiceQueryBuilder,
      );
      mockExpensesRepository.createQueryBuilder.mockReturnValue(
        mockExpenseQueryBuilder,
      );

      const result = await service.extractVATReturnData(organizationId, period);

      expect(result.organization.name).toBe('Test Org');
      expect(result.sales.standardRate.amount).toBe(1000);
      expect(result.sales.standardRate.vatAmount).toBe(50);
      expect(result.sales.zeroRate.amount).toBe(500);
      expect(result.purchases.standardRate.amount).toBe(800);
      expect(result.purchases.standardRate.vatAmount).toBe(40);
      expect(result.totals.totalOutputVAT).toBe(50);
      expect(result.totals.totalInputVAT).toBe(40);
      expect(result.totals.netVATPayable).toBe(10);
    });
  });

  describe('validateVATReturn', () => {
    it('should validate VAT return data correctly', () => {
      const data = {
        period: '2024-01',
        organization: { name: 'Test Org' },
        sales: {
          standardRate: { amount: 1000, vatAmount: 50, count: 1 },
          zeroRate: { amount: 0, vatAmount: 0, count: 0 },
          exempt: { amount: 0, count: 0 },
          reverseCharge: { amount: 0, vatAmount: 0, count: 0 },
        },
        purchases: {
          standardRate: { amount: 800, vatAmount: 40, count: 1 },
          zeroRate: { amount: 0, vatAmount: 0, count: 0 },
          exempt: { amount: 0, count: 0 },
          reverseCharge: { amount: 0, vatAmount: 0, count: 0 },
        },
        adjustments: { outputVAT: 0, inputVAT: 0 },
        totals: {
          totalOutputVAT: 50,
          totalInputVAT: 40,
          netVATPayable: 10,
          refundable: 0,
        },
      };

      const validation = service.validateVATReturn(data);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect calculation errors', () => {
      const data = {
        period: '2024-01',
        organization: { name: 'Test Org' },
        sales: {
          standardRate: { amount: 1000, vatAmount: 50, count: 1 },
          zeroRate: { amount: 0, vatAmount: 0, count: 0 },
          exempt: { amount: 0, count: 0 },
          reverseCharge: { amount: 0, vatAmount: 0, count: 0 },
        },
        purchases: {
          standardRate: { amount: 800, vatAmount: 40, count: 1 },
          zeroRate: { amount: 0, vatAmount: 0, count: 0 },
          exempt: { amount: 0, count: 0 },
          reverseCharge: { amount: 0, vatAmount: 0, count: 0 },
        },
        adjustments: { outputVAT: 0, inputVAT: 0 },
        totals: {
          totalOutputVAT: 100, // Wrong - should be 50
          totalInputVAT: 40,
          netVATPayable: 60,
          refundable: 0,
        },
      };

      const validation = service.validateVATReturn(data);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('createOrUpdateTaxForm', () => {
    it('should create new tax form if not exists', async () => {
      const organizationId = 'org-1';
      const formType = TaxFormType.VAT_RETURN_UAE;
      const period = '2024-01';
      const formData = { test: 'data' };

      const mockOrganization = {
        id: organizationId,
        name: 'Test Org',
        region: Region.UAE,
      };

      mockOrganizationsRepository.findOne.mockResolvedValue(mockOrganization);
      mockTaxFormsRepository.findOne.mockResolvedValue(null);
      mockTaxFormsRepository.create.mockReturnValue({
        organization: mockOrganization,
        formType,
        period,
        formData,
      });
      mockTaxFormsRepository.save.mockResolvedValue({
        id: 'form-1',
        organization: mockOrganization,
        formType,
        period,
        formData,
        version: 1,
      });

      const result = await service.createOrUpdateTaxForm(
        organizationId,
        formType,
        period,
        formData,
      );

      expect(result.version).toBe(1);
      expect(mockTaxFormsRepository.create).toHaveBeenCalled();
    });

    it('should update existing tax form', async () => {
      const organizationId = 'org-1';
      const formType = TaxFormType.VAT_RETURN_UAE;
      const period = '2024-01';
      const formData = { test: 'updated' };

      const existingForm = {
        id: 'form-1',
        organization: { id: organizationId },
        formType,
        period,
        formData: { test: 'old' },
        version: 1,
      };

      mockTaxFormsRepository.findOne.mockResolvedValue(existingForm);
      mockTaxFormsRepository.save.mockResolvedValue({
        ...existingForm,
        formData,
        version: 2,
      });

      const result = await service.createOrUpdateTaxForm(
        organizationId,
        formType,
        period,
        formData,
      );

      expect(result.version).toBe(2);
      expect(mockTaxFormsRepository.save).toHaveBeenCalled();
    });
  });
});

