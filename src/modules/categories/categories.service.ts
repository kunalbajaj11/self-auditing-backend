import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../../entities/category.entity';
import { Organization } from '../../entities/organization.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { User } from '../../entities/user.entity';
import { ExpenseType } from '../../entities/expense-type.entity';

const SYSTEM_DEFAULT_CATEGORIES = [
  'Fuel',
  'Food',
  'Utilities',
  'Travel',
  'Entertainment',
  'Office Supplies',
  'Telecom',
  'Maintenance',
];

const FIXED_ASSETS_CATEGORIES = [
  'Furniture',
  'Computers',
  'Tools',
  'Plant and Machinery',
  'Lease Hold Improvement',
  'Other Fixed Assets',
  'Motor Vehicles',
];

const COST_OF_SALES_CATEGORIES = [
  'Material Purchase',
  'Salaries',
  'Other Cost of Sales',
];

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async ensureDefaultsForOrganization(organizationId: string): Promise<void> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    const existing = await this.categoriesRepository.find({
      where: {
        organization: { id: organizationId },
        isSystemDefault: true,
        isDeleted: false,
      },
    });
    const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));
    
    // Create general default categories
    const toCreate = SYSTEM_DEFAULT_CATEGORIES.filter(
      (category) => !existingNames.has(category.toLowerCase()),
    );
    if (toCreate.length > 0) {
      const entities = toCreate.map((name) =>
        this.categoriesRepository.create({
          name,
          description: `${name} related expenses`,
          isSystemDefault: true,
          organization,
          expenseType: null, // General categories
        }),
      );
      await this.categoriesRepository.save(entities);
      toCreate.forEach((name) => existingNames.add(name.toLowerCase()));
    }

    // Create Fixed Assets categories
    const fixedAssetsToCreate = FIXED_ASSETS_CATEGORIES.filter(
      (category) => !existingNames.has(category.toLowerCase()),
    );
    if (fixedAssetsToCreate.length > 0) {
      const entities = fixedAssetsToCreate.map((name) =>
        this.categoriesRepository.create({
          name,
          description: `${name} - Fixed Assets`,
          isSystemDefault: true,
          organization,
          expenseType: 'fixed_assets',
        }),
      );
      await this.categoriesRepository.save(entities);
      fixedAssetsToCreate.forEach((name) => existingNames.add(name.toLowerCase()));
    }

    // Create Cost of Sales categories
    const costOfSalesToCreate = COST_OF_SALES_CATEGORIES.filter(
      (category) => !existingNames.has(category.toLowerCase()),
    );
    if (costOfSalesToCreate.length > 0) {
      const entities = costOfSalesToCreate.map((name) =>
        this.categoriesRepository.create({
          name,
          description: `${name} - Cost of Sales`,
          isSystemDefault: true,
          organization,
          expenseType: 'cost_of_sales',
        }),
      );
      await this.categoriesRepository.save(entities);
    }
  }

  async findAllByOrganization(
    organizationId: string,
    expenseType?: string,
  ): Promise<Category[]> {
    const query = this.categoriesRepository
      .createQueryBuilder('category')
      .where('category.organization_id = :organizationId', { organizationId })
      .andWhere('category.is_deleted = false');

    // Filter by expense type if provided (for fixed_assets and cost_of_sales)
    if (expenseType) {
      // Include categories that match the expense type OR have no expense type (general categories)
      query.andWhere(
        '(category.expense_type = :expenseType OR category.expense_type IS NULL)',
        { expenseType },
      );
    }
    // If no expense type specified, return all categories (no filtering)

    return query.orderBy('category.name', 'ASC').getMany();
  }

  async create(
    organizationId: string,
    createdById: string,
    dto: CreateCategoryDto,
  ): Promise<Category> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    const createdBy = await this.usersRepository.findOne({
      where: { id: createdById },
    });
    if (!createdBy) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.categoriesRepository.findOne({
      where: {
        organization: { id: organizationId },
        name: dto.name,
      },
    });
    if (existing) {
      throw new ConflictException('Category already exists');
    }

    // Determine expense type - prefer custom expense type ID over system type string
    let expenseTypeEntity: ExpenseType | null = null;
    if (dto.expenseTypeId) {
      expenseTypeEntity = await this.categoriesRepository.manager.findOne(
        ExpenseType,
        { where: { id: dto.expenseTypeId, organization: { id: organizationId } } },
      );
      if (!expenseTypeEntity) {
        throw new NotFoundException('Expense type not found');
      }
    }

    const category = this.categoriesRepository.create({
      name: dto.name,
      description: dto.description,
      expenseType: dto.expenseType || null, // For system expense types
      expenseTypeEntity: expenseTypeEntity, // For custom expense types
      organization,
      createdBy,
    });
    return this.categoriesRepository.save(category);
  }

  async update(
    categoryId: string,
    organizationId: string,
    dto: UpdateCategoryDto,
  ): Promise<Category> {
    const category = await this.categoriesRepository.findOne({
      where: { id: categoryId, organization: { id: organizationId } },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    if (dto.name && dto.name !== category.name) {
      const duplicate = await this.categoriesRepository.findOne({
        where: { organization: { id: organizationId }, name: dto.name },
      });
      if (duplicate) {
        throw new ConflictException('Category name already exists');
      }
      category.name = dto.name;
    }
    if (dto.description !== undefined) {
      category.description = dto.description;
    }
    if (dto.expenseType !== undefined) {
      category.expenseType = dto.expenseType;
      category.expenseTypeEntity = null; // Clear custom expense type if system type is set
    }
    if (dto.expenseTypeId !== undefined) {
      if (dto.expenseTypeId) {
        const expenseTypeEntity = await this.categoriesRepository.manager.findOne(
          ExpenseType,
          { where: { id: dto.expenseTypeId, organization: { id: organizationId } } },
        );
        if (!expenseTypeEntity) {
          throw new NotFoundException('Expense type not found');
        }
        category.expenseTypeEntity = expenseTypeEntity;
        category.expenseType = null; // Clear system expense type if custom type is set
      } else {
        category.expenseTypeEntity = null;
      }
    }
    return this.categoriesRepository.save(category);
  }

  async remove(categoryId: string, organizationId: string): Promise<void> {
    const category = await this.categoriesRepository.findOne({
      where: { id: categoryId, organization: { id: organizationId } },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    category.isDeleted = true;
    category.deletedAt = new Date();
    await this.categoriesRepository.save(category);
  }
}

