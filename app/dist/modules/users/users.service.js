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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("../../entities/user.entity");
const user_role_enum_1 = require("../../common/enums/user-role.enum");
const organization_entity_1 = require("../../entities/organization.entity");
const password_util_1 = require("../../utils/password.util");
let UsersService = class UsersService {
    constructor(usersRepository, organizationsRepository) {
        this.usersRepository = usersRepository;
        this.organizationsRepository = organizationsRepository;
    }
    async findByEmail(email) {
        return this.usersRepository.findOne({
            where: { email: email.toLowerCase() },
            relations: ['organization'],
        });
    }
    async findById(id) {
        const user = await this.usersRepository.findOne({
            where: { id },
            relations: ['organization'],
        });
        if (!user) {
            throw new common_1.NotFoundException(`User ${id} not found`);
        }
        return user;
    }
    async findAllByOrganization(organizationId, options) {
        const where = {
            organization: { id: organizationId },
        };
        if (options?.includeStatuses?.length) {
            where.status =
                options.includeStatuses.length === 1
                    ? options.includeStatuses[0]
                    : (0, typeorm_2.In)(options.includeStatuses);
        }
        return this.usersRepository.find({
            where,
            relations: ['organization'],
            order: { name: 'ASC' },
        });
    }
    async createSuperAdmin(dto) {
        const existing = await this.findByEmail(dto.email);
        if (existing) {
            throw new common_1.ConflictException('User with this email already exists');
        }
        const user = this.usersRepository.create({
            ...dto,
            email: dto.email.toLowerCase(),
            passwordHash: await (0, password_util_1.hashPassword)(dto.password),
            role: user_role_enum_1.UserRole.SUPERADMIN,
            organization: null,
        });
        return this.usersRepository.save(user);
    }
    async createForOrganization(organizationId, dto, roleScope) {
        if (!roleScope.includes(dto.role)) {
            throw new common_1.ConflictException('Invalid role for the current operation');
        }
        const organization = await this.organizationsRepository.findOne({
            where: { id: organizationId },
        });
        if (!organization) {
            throw new common_1.NotFoundException(`Organization ${organizationId} not found`);
        }
        const existing = await this.findByEmail(dto.email);
        if (existing) {
            throw new common_1.ConflictException('User with this email already exists');
        }
        const user = this.usersRepository.create({
            ...dto,
            email: dto.email.toLowerCase(),
            passwordHash: await (0, password_util_1.hashPassword)(dto.password),
            organization,
        });
        return this.usersRepository.save(user);
    }
    async updateUser(userId, organizationId, dto) {
        const user = await this.usersRepository.findOne({
            where: { id: userId, organization: { id: organizationId } },
            relations: ['organization'],
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        if (dto.email && dto.email !== user.email) {
            const exists = await this.findByEmail(dto.email);
            if (exists && exists.id !== user.id) {
                throw new common_1.ConflictException('Email already taken');
            }
            user.email = dto.email.toLowerCase();
        }
        if (dto.name) {
            user.name = dto.name;
        }
        if (dto.phone !== undefined) {
            user.phone = dto.phone;
        }
        if (dto.role) {
            user.role = dto.role;
        }
        return this.usersRepository.save(user);
    }
    async changeStatus(userId, organizationId, dto) {
        const user = await this.usersRepository.findOne({
            where: { id: userId, organization: { id: organizationId } },
            relations: ['organization'],
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        user.status = dto.status;
        return this.usersRepository.save(user);
    }
    async setRefreshToken(userId, tokenHash) {
        await this.usersRepository.update(userId, {
            refreshTokenHash: tokenHash,
        });
    }
    async clearRefreshToken(userId) {
        await this.usersRepository.update(userId, { refreshTokenHash: null });
    }
    async recordLogin(userId) {
        await this.usersRepository.update(userId, {
            lastLogin: new Date(),
        });
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(1, (0, typeorm_1.InjectRepository)(organization_entity_1.Organization)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], UsersService);
//# sourceMappingURL=users.service.js.map