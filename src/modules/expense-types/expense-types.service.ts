import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExpenseType } from '../../entities/expense-type.entity';
import { Organization } from '../../entities/organization.entity';
import { CreateExpenseTypeDto } from './dto/create-expense-type.dto';
import { UpdateExpenseTypeDto } from './dto/update-expense-type.dto';
import { User } from '../../entities/user.entity';
import { Expense } from '../../entities/expense.entity';

const SYSTEM_EXPENSE_TYPES = [
  { name: 'expense', displayLabel: 'Expense', description: 'Regular expense' },
  { name: 'credit', displayLabel: 'Sales', description: 'Sales/Revenue' },
  { name: 'adjustment', displayLabel: 'Adjustment', description: 'Adjustment entry' },
  { name: 'advance', displayLabel: 'Advance', description: 'Advance payment' },
  { name: 'accrual', displayLabel: 'Accrual', description: 'Accrual entry' },
  { name: 'fixed_assets', displayLabel: 'Fixed Assets', description: 'Fixed assets purchase' },
  { name: 'share_capital', displayLabel: 'Share Capital', description: 'Share capital entry' },
  { name: 'retained_earnings', displayLabel: 'Retained Earnings', description: 'Retained earnings' },
  { name: 'shareholder_account', displayLabel: 'Shareholder Account', description: 'Shareholder account' },
  { name: 'cost_of_sales', displayLabel: 'Cost of Sales', description: 'Cost of sales' },
];

@Injectable()
export class ExpenseTypesService {
  constructor(
    @InjectRepository(ExpenseType)
    private readonly expenseTypesRepository: Repository<ExpenseType>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
  ) {}

  async ensureDefaultsForOrganization(organizationId: string): Promise<void> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const existing = await this.expenseTypesRepository.find({
      where: {
        organization: { id: organizationId },
        isSystemDefault: true,
        isDeleted: false,
      },
    });
    const existingNames = new Set(existing.map((et) => et.name.toLowerCase()));

    const toCreate = SYSTEM_EXPENSE_TYPES.filter(
      (et) => !existingNames.has(et.name.toLowerCase()),
    );
    if (toCreate.length > 0) {
      const entities = toCreate.map((et) =>
        this.expenseTypesRepository.create({
          name: et.name,
          displayLabel: et.displayLabel,
          description: et.description,
          isSystemDefault: true,
          organization,
        }),
      );
      await this.expenseTypesRepository.save(entities);
    }
  }

  async findAllByOrganization(organizationId: string): Promise<ExpenseType[]> {
    return this.expenseTypesRepository.find({
      where: {
        organization: { id: organizationId },
        isDeleted: false,
      },
      order: { name: 'ASC' },
    });
  }

  async create(
    organizationId: string,
    createdById: string,
    dto: CreateExpenseTypeDto,
  ): Promise<ExpenseType> {
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

    const existing = await this.expenseTypesRepository.findOne({
      where: {
        organization: { id: organizationId },
        name: dto.name,
      },
    });
    if (existing) {
      throw new ConflictException('Expense type already exists');
    }

    const expenseType = this.expenseTypesRepository.create({
      ...dto,
      organization,
      createdBy,
      isSystemDefault: false,
    });
    return this.expenseTypesRepository.save(expenseType);
  }

  async update(
    expenseTypeId: string,
    organizationId: string,
    dto: UpdateExpenseTypeDto,
  ): Promise<ExpenseType> {
    const expenseType = await this.expenseTypesRepository.findOne({
      where: { id: expenseTypeId, organization: { id: organizationId } },
    });
    if (!expenseType) {
      throw new NotFoundException('Expense type not found');
    }

    // Prevent updating system defaults
    if (expenseType.isSystemDefault) {
      throw new ConflictException('Cannot update system default expense types');
    }

    if (dto.name && dto.name !== expenseType.name) {
      const duplicate = await this.expenseTypesRepository.findOne({
        where: { organization: { id: organizationId }, name: dto.name },
      });
      if (duplicate) {
        throw new ConflictException('Expense type name already exists');
      }
      expenseType.name = dto.name;
    }
    if (dto.description !== undefined) {
      expenseType.description = dto.description;
    }
    if (dto.displayLabel !== undefined) {
      expenseType.displayLabel = dto.displayLabel;
    }
    return this.expenseTypesRepository.save(expenseType);
  }

  async remove(expenseTypeId: string, organizationId: string): Promise<void> {
    const expenseType = await this.expenseTypesRepository.findOne({
      where: { id: expenseTypeId, organization: { id: organizationId } },
    });
    if (!expenseType) {
      throw new NotFoundException('Expense type not found');
    }

    // Prevent deleting system defaults
    if (expenseType.isSystemDefault) {
      throw new ConflictException('Cannot delete system default expense types');
    }

    // Check if expense type is used in any expenses
    const expenseCount = await this.expensesRepository.count({
      where: { expenseType: { id: expenseTypeId } },
    });
    if (expenseCount > 0) {
      throw new ConflictException(
        `Cannot delete expense type: ${expenseCount} expense(s) are using this type`,
      );
    }

    expenseType.isDeleted = true;
    expenseType.deletedAt = new Date();
    await this.expenseTypesRepository.save(expenseType);
  }
}

