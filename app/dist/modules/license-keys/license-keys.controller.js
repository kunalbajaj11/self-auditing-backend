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
exports.LicenseKeysController = void 0;
const common_1 = require("@nestjs/common");
const license_keys_service_1 = require("./license-keys.service");
const create_license_key_dto_1 = require("./dto/create-license-key.dto");
const renew_license_key_dto_1 = require("./dto/renew-license-key.dto");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const user_role_enum_1 = require("../../common/enums/user-role.enum");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
let LicenseKeysController = class LicenseKeysController {
    constructor(licenseKeysService) {
        this.licenseKeysService = licenseKeysService;
    }
    async list() {
        return this.licenseKeysService.findAll();
    }
    async create(user, dto) {
        return this.licenseKeysService.create(dto, user?.userId);
    }
    async renew(id, dto) {
        return this.licenseKeysService.renew(id, dto);
    }
    async revoke(id) {
        return this.licenseKeysService.revoke(id);
    }
};
exports.LicenseKeysController = LicenseKeysController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], LicenseKeysController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_license_key_dto_1.CreateLicenseKeyDto]),
    __metadata("design:returntype", Promise)
], LicenseKeysController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id/renew'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, renew_license_key_dto_1.RenewLicenseKeyDto]),
    __metadata("design:returntype", Promise)
], LicenseKeysController.prototype, "renew", null);
__decorate([
    (0, common_1.Patch)(':id/revoke'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], LicenseKeysController.prototype, "revoke", null);
exports.LicenseKeysController = LicenseKeysController = __decorate([
    (0, common_1.Controller)('license-keys'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.SUPERADMIN),
    __metadata("design:paramtypes", [license_keys_service_1.LicenseKeysService])
], LicenseKeysController);
//# sourceMappingURL=license-keys.controller.js.map