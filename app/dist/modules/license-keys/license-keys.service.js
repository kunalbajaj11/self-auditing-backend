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
exports.LicenseKeysService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const crypto_1 = require("crypto");
const license_key_entity_1 = require("../../entities/license-key.entity");
const license_key_status_enum_1 = require("../../common/enums/license-key-status.enum");
let LicenseKeysService = class LicenseKeysService {
    constructor(licenseKeysRepository) {
        this.licenseKeysRepository = licenseKeysRepository;
    }
    async create(dto, createdById) {
        const key = this.generateUniqueKey();
        const now = new Date();
        const validityDays = dto.validityDays ?? 365;
        const expiresAt = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);
        const license = this.licenseKeysRepository.create({
            key,
            status: license_key_status_enum_1.LicenseKeyStatus.ACTIVE,
            planType: dto.planType ?? null,
            maxUsers: dto.maxUsers ?? null,
            storageQuotaMb: dto.storageQuotaMb ?? null,
            expiresAt,
            notes: dto.notes ?? null,
            createdById,
        });
        return this.licenseKeysRepository.save(license);
    }
    async findAll() {
        const licenses = await this.licenseKeysRepository.find({
            order: { createdAt: 'DESC' },
        });
        const now = new Date();
        const toUpdate = [];
        licenses.forEach((license) => {
            if (license.status === license_key_status_enum_1.LicenseKeyStatus.ACTIVE &&
                license.expiresAt.getTime() < now.getTime()) {
                license.status = license_key_status_enum_1.LicenseKeyStatus.EXPIRED;
                toUpdate.push(license);
            }
        });
        if (toUpdate.length > 0) {
            await this.licenseKeysRepository.save(toUpdate);
        }
        return licenses;
    }
    async renew(id, dto) {
        const license = await this.licenseKeysRepository.findOne({ where: { id } });
        if (!license) {
            throw new common_1.NotFoundException('License key not found');
        }
        if (license.status === license_key_status_enum_1.LicenseKeyStatus.REVOKED) {
            throw new common_1.BadRequestException('Revoked licenses cannot be renewed');
        }
        let newExpiry = null;
        if (dto.newExpiry) {
            newExpiry = new Date(dto.newExpiry);
        }
        else if (dto.extendByDays) {
            newExpiry = new Date(license.expiresAt.getTime() + dto.extendByDays * 24 * 60 * 60 * 1000);
        }
        else {
            newExpiry = new Date(license.expiresAt.getTime() + 365 * 24 * 60 * 60 * 1000);
        }
        license.expiresAt = newExpiry;
        if (license.status === license_key_status_enum_1.LicenseKeyStatus.EXPIRED) {
            license.status =
                license.consumedAt != null
                    ? license_key_status_enum_1.LicenseKeyStatus.CONSUMED
                    : license_key_status_enum_1.LicenseKeyStatus.ACTIVE;
        }
        return this.licenseKeysRepository.save(license);
    }
    async revoke(id) {
        const license = await this.licenseKeysRepository.findOne({ where: { id } });
        if (!license) {
            throw new common_1.NotFoundException('License key not found');
        }
        license.status = license_key_status_enum_1.LicenseKeyStatus.REVOKED;
        return this.licenseKeysRepository.save(license);
    }
    async validateForRegistration(licenseKeyValue) {
        const license = await this.licenseKeysRepository.findOne({
            where: { key: licenseKeyValue },
        });
        if (!license) {
            throw new common_1.UnauthorizedException('Invalid license key');
        }
        if (license.status === license_key_status_enum_1.LicenseKeyStatus.REVOKED) {
            throw new common_1.UnauthorizedException('License key revoked');
        }
        if (license.status === license_key_status_enum_1.LicenseKeyStatus.CONSUMED) {
            throw new common_1.UnauthorizedException('License key already used');
        }
        const now = new Date();
        if (license.expiresAt.getTime() < now.getTime()) {
            license.status = license_key_status_enum_1.LicenseKeyStatus.EXPIRED;
            await this.licenseKeysRepository.save(license);
            throw new common_1.UnauthorizedException('License key expired');
        }
        return license;
    }
    async markAsConsumed(licenseId, organizationId, userId) {
        const license = await this.licenseKeysRepository.findOne({
            where: { id: licenseId },
        });
        if (!license) {
            throw new common_1.NotFoundException('License key not found');
        }
        license.status = license_key_status_enum_1.LicenseKeyStatus.CONSUMED;
        license.consumedAt = new Date();
        license.consumedByOrganizationId = organizationId;
        license.consumedByUserId = userId;
        await this.licenseKeysRepository.save(license);
    }
    async findAndRenewByOrganizationId(organizationId, expiryDate) {
        const license = await this.licenseKeysRepository.findOne({
            where: { consumedByOrganizationId: organizationId },
        });
        if (!license) {
            throw new common_1.NotFoundException('License key not found for this organization');
        }
        license.expiresAt = expiryDate;
        if (license.status === license_key_status_enum_1.LicenseKeyStatus.EXPIRED) {
            license.status = license_key_status_enum_1.LicenseKeyStatus.CONSUMED;
        }
        return this.licenseKeysRepository.save(license);
    }
    async findByOrganizationId(organizationId) {
        return this.licenseKeysRepository.findOne({
            where: { consumedByOrganizationId: organizationId },
        });
    }
    generateUniqueKey() {
        return (0, crypto_1.randomBytes)(16).toString('hex').toUpperCase();
    }
};
exports.LicenseKeysService = LicenseKeysService;
exports.LicenseKeysService = LicenseKeysService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(license_key_entity_1.LicenseKey)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], LicenseKeysService);
//# sourceMappingURL=license-keys.service.js.map