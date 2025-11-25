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
exports.ExpenseTypesController = void 0;
const common_1 = require("@nestjs/common");
const expense_types_service_1 = require("./expense-types.service");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const user_role_enum_1 = require("../../common/enums/user-role.enum");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const tenant_guard_1 = require("../../common/guards/tenant.guard");
const create_expense_type_dto_1 = require("./dto/create-expense-type.dto");
const update_expense_type_dto_1 = require("./dto/update-expense-type.dto");
let ExpenseTypesController = class ExpenseTypesController {
    constructor(expenseTypesService) {
        this.expenseTypesService = expenseTypesService;
    }
    async list(user) {
        await this.expenseTypesService.ensureDefaultsForOrganization(user?.organizationId);
        return this.expenseTypesService.findAllByOrganization(user?.organizationId);
    }
    async create(user, dto) {
        return this.expenseTypesService.create(user?.organizationId, user?.userId, dto);
    }
    async update(id, user, dto) {
        return this.expenseTypesService.update(id, user?.organizationId, dto);
    }
    async remove(id, user) {
        await this.expenseTypesService.remove(id, user?.organizationId);
        return { success: true };
    }
};
exports.ExpenseTypesController = ExpenseTypesController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ExpenseTypesController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_expense_type_dto_1.CreateExpenseTypeDto]),
    __metadata("design:returntype", Promise)
], ExpenseTypesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, update_expense_type_dto_1.UpdateExpenseTypeDto]),
    __metadata("design:returntype", Promise)
], ExpenseTypesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ExpenseTypesController.prototype, "remove", null);
exports.ExpenseTypesController = ExpenseTypesController = __decorate([
    (0, common_1.Controller)('expense-types'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, tenant_guard_1.TenantGuard),
    __metadata("design:paramtypes", [expense_types_service_1.ExpenseTypesService])
], ExpenseTypesController);
//# sourceMappingURL=expense-types.controller.js.map