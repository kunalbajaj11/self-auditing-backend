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
exports.OrganizationsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const organization_entity_1 = require("../../entities/organization.entity");
const plan_entity_1 = require("../../entities/plan.entity");
const organization_status_enum_1 = require("../../common/enums/organization-status.enum");
const license_keys_service_1 = require("../license-keys/license-keys.service");
let OrganizationsService = class OrganizationsService {
    constructor(organizationsRepository, plansRepository, licenseKeysService) {
        this.organizationsRepository = organizationsRepository;
        this.plansRepository = plansRepository;
        this.licenseKeysService = licenseKeysService;
    }
    normalizeDateString(value) {
        if (value === undefined || value === null)
            return null;
        const trimmed = String(value).trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    async create(dto) {
        const existing = await this.organizationsRepository.findOne({
            where: { name: dto.name },
        });
        if (existing) {
            throw new common_1.ConflictException('Organization with this name already exists');
        }
        const organization = this.organizationsRepository.create({
            name: dto.name,
            vatNumber: dto.vatNumber,
            address: dto.address,
            currency: dto.currency ?? 'AED',
            fiscalYearStart: this.normalizeDateString(dto.fiscalYearStart),
            planType: dto.planType,
            contactPerson: dto.contactPerson,
            contactEmail: dto.contactEmail,
            storageQuotaMb: dto.storageQuotaMb ?? 500,
            status: organization_status_enum_1.OrganizationStatus.ACTIVE,
        });
        if (dto.planId) {
            const plan = await this.plansRepository.findOne({
                where: { id: dto.planId },
            });
            if (!plan) {
                throw new common_1.NotFoundException('Plan not found');
            }
            organization.plan = plan;
        }
        return this.organizationsRepository.save(organization);
    }
    async findAll() {
        return this.organizationsRepository.find({
            relations: ['plan'],
            order: { createdAt: 'DESC' },
        });
    }
    async findById(id) {
        const organization = await this.organizationsRepository.findOne({
            where: { id },
            relations: ['plan'],
        });
        if (!organization) {
            throw new common_1.NotFoundException(`Organization ${id} not found`);
        }
        return organization;
    }
    async update(id, dto) {
        const organization = await this.findById(id);
        if (dto.name && dto.name !== organization.name) {
            const exists = await this.organizationsRepository.findOne({
                where: { name: dto.name },
            });
            if (exists && exists.id !== id) {
                throw new common_1.ConflictException('Organization name already in use');
            }
            organization.name = dto.name;
        }
        if (dto.vatNumber !== undefined) {
            organization.vatNumber = dto.vatNumber;
        }
        if (dto.address !== undefined) {
            organization.address = dto.address;
        }
        if (dto.currency !== undefined) {
            organization.currency = dto.currency;
        }
        if (dto.fiscalYearStart !== undefined) {
            organization.fiscalYearStart = this.normalizeDateString(dto.fiscalYearStart);
        }
        if (dto.planType !== undefined) {
            organization.planType = dto.planType;
        }
        if (dto.contactPerson !== undefined) {
            organization.contactPerson = dto.contactPerson;
        }
        if (dto.contactEmail !== undefined) {
            organization.contactEmail = dto.contactEmail;
        }
        if (dto.storageQuotaMb !== undefined) {
            organization.storageQuotaMb = dto.storageQuotaMb;
        }
        if (dto.planId !== undefined) {
            if (dto.planId === null) {
                organization.plan = null;
            }
            else {
                const plan = await this.plansRepository.findOne({
                    where: { id: dto.planId },
                });
                if (!plan) {
                    throw new common_1.NotFoundException('Plan not found');
                }
                organization.plan = plan;
            }
        }
        return this.organizationsRepository.save(organization);
    }
    async changeStatus(id, dto) {
        const organization = await this.findById(id);
        organization.status = dto.status;
        return this.organizationsRepository.save(organization);
    }
    async activateWithExpiry(id, dto) {
        const organization = await this.findById(id);
        const expiryDate = new Date(dto.expiryDate);
        await this.licenseKeysService.findAndRenewByOrganizationId(id, expiryDate);
        organization.status = organization_status_enum_1.OrganizationStatus.ACTIVE;
        return this.organizationsRepository.save(organization);
    }
};
exports.OrganizationsService = OrganizationsService;
exports.OrganizationsService = OrganizationsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(organization_entity_1.Organization)),
    __param(1, (0, typeorm_1.InjectRepository)(plan_entity_1.Plan)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        license_keys_service_1.LicenseKeysService])
], OrganizationsService);
//# sourceMappingURL=organizations.service.js.map