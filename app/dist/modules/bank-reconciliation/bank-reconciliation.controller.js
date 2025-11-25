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
exports.BankReconciliationController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const tenant_guard_1 = require("../../common/guards/tenant.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const user_role_enum_1 = require("../../common/enums/user-role.enum");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const reconciliation_service_1 = require("./reconciliation.service");
const reconciliation_report_service_1 = require("./reconciliation-report.service");
const upload_statement_dto_1 = require("./dto/upload-statement.dto");
const match_transactions_dto_1 = require("./dto/match-transactions.dto");
const reconciliation_filter_dto_1 = require("./dto/reconciliation-filter.dto");
let BankReconciliationController = class BankReconciliationController {
    constructor(reconciliationService, reportService) {
        this.reconciliationService = reconciliationService;
        this.reportService = reportService;
    }
    async uploadStatement(user, file, dto) {
        if (!file) {
            throw new Error('File is required');
        }
        return this.reconciliationService.uploadAndParseStatement(user?.organizationId, user?.userId, file, dto.statementPeriodStart, dto.statementPeriodEnd);
    }
    async listReconciliations(user, filters) {
        return this.reconciliationService.getReconciliationRecords(user?.organizationId, filters);
    }
    async getReconciliationDetail(user, id) {
        return this.reconciliationService.getReconciliationDetail(user?.organizationId, id);
    }
    async matchTransactions(user, dto) {
        await this.reconciliationService.manualMatch(user?.organizationId, dto);
        return { message: 'Transactions matched successfully' };
    }
    async createManualEntry(user, dto) {
        return this.reconciliationService.createManualEntry(user?.organizationId, user?.userId, dto.reconciliationRecordId, dto);
    }
    async downloadPDFReport(user, id, res) {
        const pdfBuffer = await this.reportService.generatePDFReport(user?.organizationId, id);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="bank-reconciliation-${id}.pdf"`);
        res.send(pdfBuffer);
    }
    async downloadExcelReport(user, id, res) {
        const excelBuffer = await this.reportService.generateExcelReport(user?.organizationId, id);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="bank-reconciliation-${id}.xlsx"`);
        res.send(excelBuffer);
    }
};
exports.BankReconciliationController = BankReconciliationController;
__decorate([
    (0, common_1.Post)('upload'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, upload_statement_dto_1.UploadStatementDto]),
    __metadata("design:returntype", Promise)
], BankReconciliationController.prototype, "uploadStatement", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT, user_role_enum_1.UserRole.SUPERADMIN),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, reconciliation_filter_dto_1.ReconciliationFilterDto]),
    __metadata("design:returntype", Promise)
], BankReconciliationController.prototype, "listReconciliations", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT, user_role_enum_1.UserRole.SUPERADMIN),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BankReconciliationController.prototype, "getReconciliationDetail", null);
__decorate([
    (0, common_1.Post)('match'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, match_transactions_dto_1.MatchTransactionsDto]),
    __metadata("design:returntype", Promise)
], BankReconciliationController.prototype, "matchTransactions", null);
__decorate([
    (0, common_1.Post)('manual-entry'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BankReconciliationController.prototype, "createManualEntry", null);
__decorate([
    (0, common_1.Get)('report/:id/pdf'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT, user_role_enum_1.UserRole.SUPERADMIN),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], BankReconciliationController.prototype, "downloadPDFReport", null);
__decorate([
    (0, common_1.Get)('report/:id/excel'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT, user_role_enum_1.UserRole.SUPERADMIN),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], BankReconciliationController.prototype, "downloadExcelReport", null);
exports.BankReconciliationController = BankReconciliationController = __decorate([
    (0, common_1.Controller)('bank-reconciliation'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, tenant_guard_1.TenantGuard),
    __metadata("design:paramtypes", [reconciliation_service_1.ReconciliationService,
        reconciliation_report_service_1.ReconciliationReportService])
], BankReconciliationController);
//# sourceMappingURL=bank-reconciliation.controller.js.map