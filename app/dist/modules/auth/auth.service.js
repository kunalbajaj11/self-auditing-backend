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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const users_service_1 = require("../users/users.service");
const organizations_service_1 = require("../organizations/organizations.service");
const categories_service_1 = require("../categories/categories.service");
const user_role_enum_1 = require("../../common/enums/user-role.enum");
const password_util_1 = require("../../utils/password.util");
const audit_logs_service_1 = require("../audit-logs/audit-logs.service");
const audit_action_enum_1 = require("../../common/enums/audit-action.enum");
const license_keys_service_1 = require("../license-keys/license-keys.service");
const organization_status_enum_1 = require("../../common/enums/organization-status.enum");
let AuthService = class AuthService {
    constructor(usersService, organizationsService, categoriesService, auditLogsService, jwtService, configService, licenseKeysService) {
        this.usersService = usersService;
        this.organizationsService = organizationsService;
        this.categoriesService = categoriesService;
        this.auditLogsService = auditLogsService;
        this.jwtService = jwtService;
        this.configService = configService;
        this.licenseKeysService = licenseKeysService;
    }
    async previewLicense(dto) {
        const license = await this.licenseKeysService.validateForRegistration(dto.licenseKey.trim());
        return {
            key: license.key,
            planType: license.planType,
            maxUsers: license.maxUsers,
            storageQuotaMb: license.storageQuotaMb,
            expiresAt: license.expiresAt,
            status: license.status,
        };
    }
    async registerWithLicense(dto) {
        const license = await this.licenseKeysService.validateForRegistration(dto.licenseKey.trim());
        const planType = license.planType ?? dto.planType;
        if (!planType) {
            throw new common_1.BadRequestException('Plan type must be provided by the license or registration form.');
        }
        const organization = await this.organizationsService.create({
            name: dto.organizationName,
            planType,
            vatNumber: dto.vatNumber,
            address: dto.address,
            currency: dto.currency,
            fiscalYearStart: dto.fiscalYearStart,
            contactPerson: dto.contactPerson ?? undefined,
            contactEmail: dto.contactEmail ?? dto.adminEmail,
            storageQuotaMb: license.storageQuotaMb ?? dto.storageQuotaMb ?? undefined,
            planId: undefined,
        });
        await this.categoriesService.ensureDefaultsForOrganization(organization.id);
        const adminUser = await this.usersService.createForOrganization(organization.id, {
            name: dto.adminName,
            email: dto.adminEmail,
            password: dto.adminPassword,
            role: user_role_enum_1.UserRole.ADMIN,
            phone: dto.adminPhone,
        }, [user_role_enum_1.UserRole.ADMIN]);
        await this.licenseKeysService.markAsConsumed(license.id, organization.id, adminUser.id);
        await this.auditLogsService.record({
            organizationId: organization.id,
            userId: adminUser.id,
            entityType: 'Organization',
            entityId: organization.id,
            action: audit_action_enum_1.AuditAction.CREATE,
            changes: {
                name: organization.name,
                planType: organization.planType,
                licenseKey: license.key,
            },
        });
        const tokens = await this.generateTokens(adminUser);
        return { tokens, user: this.mapUser(adminUser) };
    }
    async login(dto) {
        const user = await this.usersService.findByEmail(dto.email);
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const passwordValid = await (0, password_util_1.comparePassword)(dto.password, user.passwordHash);
        if (!passwordValid) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (user.status !== 'active') {
            throw new common_1.ForbiddenException('User account is inactive');
        }
        if (user.organization &&
            user.organization.status === organization_status_enum_1.OrganizationStatus.INACTIVE) {
            throw new common_1.ForbiddenException('Your organization is inactive. Please contact your administrator.');
        }
        const tokens = await this.generateTokens(user);
        await this.usersService.recordLogin(user.id);
        if (user.organization?.id) {
            await this.auditLogsService.record({
                organizationId: user.organization.id,
                userId: user.id,
                entityType: 'User',
                entityId: user.id,
                action: audit_action_enum_1.AuditAction.LOGIN,
            });
        }
        return { tokens, user: this.mapUser(user) };
    }
    async refreshToken(dto) {
        let payload;
        try {
            payload = await this.jwtService.verifyAsync(dto.refreshToken, {
                secret: this.configService.get('JWT_REFRESH_SECRET'),
            });
        }
        catch (error) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        const user = await this.usersService.findById(payload.sub);
        if (!user.refreshTokenHash) {
            throw new common_1.UnauthorizedException('Refresh token revoked');
        }
        const isValid = await (0, password_util_1.comparePassword)(dto.refreshToken, user.refreshTokenHash);
        if (!isValid) {
            throw new common_1.UnauthorizedException('Refresh token invalid');
        }
        return this.generateTokens(user);
    }
    async logout(userId) {
        await this.usersService.clearRefreshToken(userId);
    }
    async generateTokens(user) {
        const payload = {
            sub: user.id,
            role: user.role,
            email: user.email,
            organizationId: user.organization?.id ?? null,
        };
        const accessExpiresIn = Number(this.configService.get('JWT_ACCESS_EXPIRES_IN_SECONDS') ?? 900);
        const accessToken = await this.jwtService.signAsync(payload, {
            secret: this.configService.get('JWT_ACCESS_SECRET'),
            expiresIn: accessExpiresIn,
        });
        const refreshExpires = this.configService.get('JWT_REFRESH_EXPIRES_IN') ?? '7d';
        const refreshToken = await this.jwtService.signAsync({ sub: user.id }, {
            secret: this.configService.get('JWT_REFRESH_SECRET'),
            expiresIn: refreshExpires,
        });
        const refreshTokenHash = await (0, password_util_1.hashPassword)(refreshToken);
        await this.usersService.setRefreshToken(user.id, refreshTokenHash);
        return {
            accessToken,
            refreshToken,
            expiresIn: accessExpiresIn,
        };
    }
    mapUser(user) {
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            organization: user.organization
                ? {
                    id: user.organization.id,
                    name: user.organization.name,
                }
                : null,
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        organizations_service_1.OrganizationsService,
        categories_service_1.CategoriesService,
        audit_logs_service_1.AuditLogsService,
        jwt_1.JwtService,
        config_1.ConfigService,
        license_keys_service_1.LicenseKeysService])
], AuthService);
//# sourceMappingURL=auth.service.js.map