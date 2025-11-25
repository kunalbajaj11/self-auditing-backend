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
exports.CategoriesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const category_entity_1 = require("../../entities/category.entity");
const organization_entity_1 = require("../../entities/organization.entity");
const user_entity_1 = require("../../entities/user.entity");
const expense_type_entity_1 = require("../../entities/expense-type.entity");
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
let CategoriesService = class CategoriesService {
    constructor(categoriesRepository, organizationsRepository, usersRepository) {
        this.categoriesRepository = categoriesRepository;
        this.organizationsRepository = organizationsRepository;
        this.usersRepository = usersRepository;
    }
    async ensureDefaultsForOrganization(organizationId) {
        const organization = await this.organizationsRepository.findOne({
            where: { id: organizationId },
        });
        if (!organization) {
            throw new common_1.NotFoundException('Organization not found');
        }
        const existing = await this.categoriesRepository.find({
            where: {
                organization: { id: organizationId },
                isSystemDefault: true,
                isDeleted: false,
            },
        });
        const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));
        const toCreate = SYSTEM_DEFAULT_CATEGORIES.filter((category) => !existingNames.has(category.toLowerCase()));
        if (toCreate.length > 0) {
            const entities = toCreate.map((name) => this.categoriesRepository.create({
                name,
                description: `${name} related expenses`,
                isSystemDefault: true,
                organization,
                expenseType: null,
            }));
            await this.categoriesRepository.save(entities);
            toCreate.forEach((name) => existingNames.add(name.toLowerCase()));
        }
        const fixedAssetsToCreate = FIXED_ASSETS_CATEGORIES.filter((category) => !existingNames.has(category.toLowerCase()));
        if (fixedAssetsToCreate.length > 0) {
            const entities = fixedAssetsToCreate.map((name) => this.categoriesRepository.create({
                name,
                description: `${name} - Fixed Assets`,
                isSystemDefault: true,
                organization,
                expenseType: 'fixed_assets',
            }));
            await this.categoriesRepository.save(entities);
            fixedAssetsToCreate.forEach((name) => existingNames.add(name.toLowerCase()));
        }
        const costOfSalesToCreate = COST_OF_SALES_CATEGORIES.filter((category) => !existingNames.has(category.toLowerCase()));
        if (costOfSalesToCreate.length > 0) {
            const entities = costOfSalesToCreate.map((name) => this.categoriesRepository.create({
                name,
                description: `${name} - Cost of Sales`,
                isSystemDefault: true,
                organization,
                expenseType: 'cost_of_sales',
            }));
            await this.categoriesRepository.save(entities);
        }
    }
    async findAllByOrganization(organizationId, expenseType) {
        const query = this.categoriesRepository
            .createQueryBuilder('category')
            .where('category.organization_id = :organizationId', { organizationId })
            .andWhere('category.is_deleted = false');
        if (expenseType) {
            query.andWhere('(category.expense_type = :expenseType OR category.expense_type IS NULL)', { expenseType });
        }
        return query.orderBy('category.name', 'ASC').getMany();
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
        const existing = await this.categoriesRepository.findOne({
            where: {
                organization: { id: organizationId },
                name: dto.name,
            },
        });
        if (existing) {
            throw new common_1.ConflictException('Category already exists');
        }
        let expenseTypeEntity = null;
        if (dto.expenseTypeId) {
            expenseTypeEntity = await this.categoriesRepository.manager.findOne(expense_type_entity_1.ExpenseType, { where: { id: dto.expenseTypeId, organization: { id: organizationId } } });
            if (!expenseTypeEntity) {
                throw new common_1.NotFoundException('Expense type not found');
            }
        }
        const category = this.categoriesRepository.create({
            name: dto.name,
            description: dto.description,
            expenseType: dto.expenseType || null,
            expenseTypeEntity: expenseTypeEntity,
            organization,
            createdBy,
        });
        return this.categoriesRepository.save(category);
    }
    async update(categoryId, organizationId, dto) {
        const category = await this.categoriesRepository.findOne({
            where: { id: categoryId, organization: { id: organizationId } },
        });
        if (!category) {
            throw new common_1.NotFoundException('Category not found');
        }
        if (dto.name && dto.name !== category.name) {
            const duplicate = await this.categoriesRepository.findOne({
                where: { organization: { id: organizationId }, name: dto.name },
            });
            if (duplicate) {
                throw new common_1.ConflictException('Category name already exists');
            }
            category.name = dto.name;
        }
        if (dto.description !== undefined) {
            category.description = dto.description;
        }
        if (dto.expenseType !== undefined) {
            category.expenseType = dto.expenseType;
            category.expenseTypeEntity = null;
        }
        if (dto.expenseTypeId !== undefined) {
            if (dto.expenseTypeId) {
                const expenseTypeEntity = await this.categoriesRepository.manager.findOne(expense_type_entity_1.ExpenseType, { where: { id: dto.expenseTypeId, organization: { id: organizationId } } });
                if (!expenseTypeEntity) {
                    throw new common_1.NotFoundException('Expense type not found');
                }
                category.expenseTypeEntity = expenseTypeEntity;
                category.expenseType = null;
            }
            else {
                category.expenseTypeEntity = null;
            }
        }
        return this.categoriesRepository.save(category);
    }
    async remove(categoryId, organizationId) {
        const category = await this.categoriesRepository.findOne({
            where: { id: categoryId, organization: { id: organizationId } },
        });
        if (!category) {
            throw new common_1.NotFoundException('Category not found');
        }
        category.isDeleted = true;
        category.deletedAt = new Date();
        await this.categoriesRepository.save(category);
    }
};
exports.CategoriesService = CategoriesService;
exports.CategoriesService = CategoriesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(category_entity_1.Category)),
    __param(1, (0, typeorm_1.InjectRepository)(organization_entity_1.Organization)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], CategoriesService);
//# sourceMappingURL=categories.service.js.map