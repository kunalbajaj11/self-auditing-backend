"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpenseTypesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const expense_type_entity_1 = require("../../entities/expense-type.entity");
const organization_entity_1 = require("../../entities/organization.entity");
const user_entity_1 = require("../../entities/user.entity");
const expense_entity_1 = require("../../entities/expense.entity");
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
let ExpenseTypesService = class ExpenseTypesService {
    constructor(expenseTypesRepository, organizationsRepository, usersRepository, expensesRepository) {
        this.expenseTypesRepository = expenseTypesRepository;
        this.organizationsRepository = organizationsRepository;
        this.usersRepository = usersRepository;
        this.expensesRepository = expensesRepository;
    }
    async ensureDefaultsForOrganization(organizationId) {
        const organization = await this.organizationsRepository.findOne({
            where: { id: organizationId },
        });
        if (!organization) {
            throw new common_1.NotFoundException('Organization not found');
        }
        const existing = await this.expenseTypesRepository.find({
            where: {
                organization: { id: organizationId },
                isSystemDefault: true,
                isDeleted: false,
            },
        });
        const existingNames = new Set(existing.map((et) => et.name.toLowerCase()));
        const toCreate = SYSTEM_EXPENSE_TYPES.filter((et) => !existingNames.has(et.name.toLowerCase()));
        if (toCreate.length > 0) {
            const entities = toCreate.map((et) => this.expenseTypesRepository.create({
                name: et.name,
                displayLabel: et.displayLabel,
                description: et.description,
                isSystemDefault: true,
                organization,
            }));
            await this.expenseTypesRepository.save(entities);
        }
    }
    async findAllByOrganization(organizationId) {
        return this.expenseTypesRepository.find({
            where: {
                organization: { id: organizationId },
                isDeleted: false,
            },
            order: { name: 'ASC' },
        });
    }
    async create(organizationId, createdById, dto) {
        const organization = await this.organizationsRepository.findOne({
            where: { id: organizationId },
        });
        if (!organization) {
            throw new common_1.NotFoundException('Organization not found');
        }
        const createdBy = await this.usersRepository.findOne({
            where: { id: createdById },
        });
        if (!createdBy) {
            throw new common_1.NotFoundException('User not found');
        }
        const existing = await this.expenseTypesRepository.findOne({
            where: {
                organization: { id: organizationId },
                name: dto.name,
            },
        });
        if (existing) {
            throw new common_1.ConflictException('Expense type already exists');
        }
        const expenseType = this.expenseTypesRepository.create({
            ...dto,
            organization,
            createdBy,
            isSystemDefault: false,
        });
        return this.expenseTypesRepository.save(expenseType);
    }
    async update(expenseTypeId, organizationId, dto) {
        const expenseType = await this.expenseTypesRepository.findOne({
            where: { id: expenseTypeId, organization: { id: organizationId } },
        });
        if (!expenseType) {
            throw new common_1.NotFoundException('Expense type not found');
        }
        if (expenseType.isSystemDefault) {
            throw new common_1.ConflictException('Cannot update system default expense types');
        }
        if (dto.name && dto.name !== expenseType.name) {
            const duplicate = await this.expenseTypesRepository.findOne({
                where: { organization: { id: organizationId }, name: dto.name },
            });
            if (duplicate) {
                throw new common_1.ConflictException('Expense type name already exists');
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
    async remove(expenseTypeId, organizationId) {
        const expenseType = await this.expenseTypesRepository.findOne({
            where: { id: expenseTypeId, organization: { id: organizationId } },
        });
        if (!expenseType) {
            throw new common_1.NotFoundException('Expense type not found');
        }
        if (expenseType.isSystemDefault) {
            throw new common_1.ConflictException('Cannot delete system default expense types');
        }
        const expenseCount = await this.expensesRepository.count({
            where: { expenseType: { id: expenseTypeId } },
        });
        if (expenseCount > 0) {
            throw new common_1.ConflictException(`Cannot delete expense type: ${expenseCount} expense(s) are using this type`);
        }
        expenseType.isDeleted = true;
        expenseType.deletedAt = new Date();
        await this.expenseTypesRepository.save(expenseType);
    }
};
exports.ExpenseTypesService = ExpenseTypesService;
exports.ExpenseTypesService = ExpenseTypesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(expense_type_entity_1.ExpenseType)),
    __param(1, (0, typeorm_1.InjectRepository)(organization_entity_1.Organization)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(3, (0, typeorm_1.InjectRepository)(expense_entity_1.Expense)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], ExpenseTypesService);
//# sourceMappingURL=expense-types.service.js.map