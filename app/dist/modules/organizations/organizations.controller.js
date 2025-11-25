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
exports.OrganizationsController = void 0;
const common_1 = require("@nestjs/common");
const organizations_service_1 = require("./organizations.service");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const user_role_enum_1 = require("../../common/enums/user-role.enum");
const create_organization_dto_1 = require("./dto/create-organization.dto");
const update_organization_dto_1 = require("./dto/update-organization.dto");
const change_status_dto_1 = require("./dto/change-status.dto");
const activate_with_expiry_dto_1 = require("./dto/activate-with-expiry.dto");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const tenant_guard_1 = require("../../common/guards/tenant.guard");
let OrganizationsController = class OrganizationsController {
    constructor(organizationsService) {
        this.organizationsService = organizationsService;
    }
    async list() {
        const organizations = await this.organizationsService.findAll();
        return organizations.map((org) => ({
            id: org.id,
            name: org.name,
            planType: org.planType,
            status: org.status,
            contactEmail: org.contactEmail,
            createdAt: org.createdAt,
            plan: org.plan
                ? {
                    id: org.plan.id,
                    name: org.plan.name,
                }
                : null,
        }));
    }
    async create(dto) {
        const organization = await this.organizationsService.create(dto);
        return {
            id: organization.id,
            name: organization.name,
            planType: organization.planType,
            status: organization.status,
        };
    }
    async getMyOrganization(user) {
        const organization = await this.organizationsService.findById(user?.organizationId);
        return {
            id: organization.id,
            name: organization.name,
            currency: organization.currency,
            fiscalYearStart: organization.fiscalYearStart,
            planType: organization.planType,
            status: organization.status,
            storageQuotaMb: organization.storageQuotaMb,
            contactPerson: organization.contactPerson,
            contactEmail: organization.contactEmail,
        };
    }
    async updateMyOrganization(user, dto) {
        const updated = await this.organizationsService.update(user?.organizationId, dto);
        return {
            id: updated.id,
            name: updated.name,
            currency: updated.currency,
            fiscalYearStart: updated.fiscalYearStart,
            status: updated.status,
            contactPerson: updated.contactPerson,
            contactEmail: updated.contactEmail,
            storageQuotaMb: updated.storageQuotaMb,
            planType: updated.planType,
        };
    }
    async get(id) {
        return this.organizationsService.findById(id);
    }
    async update(id, dto) {
        return this.organizationsService.update(id, dto);
    }
    async changeStatus(id, dto) {
        return this.organizationsService.changeStatus(id, dto);
    }
    async activateWithExpiry(id, dto) {
        return this.organizationsService.activateWithExpiry(id, dto);
    }
};
exports.OrganizationsController = OrganizationsController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.SUPERADMIN),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.SUPERADMIN),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_organization_dto_1.CreateOrganizationDto]),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, common_1.UseGuards)(tenant_guard_1.TenantGuard),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT, user_role_enum_1.UserRole.EMPLOYEE),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "getMyOrganization", null);
__decorate([
    (0, common_1.Patch)('me'),
    (0, common_1.UseGuards)(tenant_guard_1.TenantGuard),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_organization_dto_1.UpdateOrganizationDto]),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "updateMyOrganization", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.SUPERADMIN),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "get", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.SUPERADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_organization_dto_1.UpdateOrganizationDto]),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.SUPERADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, change_status_dto_1.ChangeOrganizationStatusDto]),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "changeStatus", null);
__decorate([
    (0, common_1.Patch)(':id/activate'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.SUPERADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, activate_with_expiry_dto_1.ActivateOrganizationWithExpiryDto]),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "activateWithExpiry", null);
exports.OrganizationsController = OrganizationsController = __decorate([
    (0, common_1.Controller)('organizations'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [organizations_service_1.OrganizationsService])
], OrganizationsController);
//# sourceMappingURL=organizations.controller.js.map