"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const reports_service_1 = require("./reports.service");
const reports_controller_1 = require("./reports.controller");
const report_generator_service_1 = require("./report-generator.service");
const expense_entity_1 = require("../../entities/expense.entity");
const accrual_entity_1 = require("../../entities/accrual.entity");
const report_entity_1 = require("../../entities/report.entity");
const audit_log_entity_1 = require("../../entities/audit-log.entity");
const organization_entity_1 = require("../../entities/organization.entity");
const attachment_entity_1 = require("../../entities/attachment.entity");
const vendor_entity_1 = require("../vendors/vendor.entity");
const user_entity_1 = require("../../entities/user.entity");
const notifications_module_1 = require("../notifications/notifications.module");
let ReportsModule = class ReportsModule {
};
exports.ReportsModule = ReportsModule;
exports.ReportsModule = ReportsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([expense_entity_1.Expense, accrual_entity_1.Accrual, report_entity_1.Report, audit_log_entity_1.AuditLog, organization_entity_1.Organization, attachment_entity_1.Attachment, vendor_entity_1.Vendor, user_entity_1.User]),
            notifications_module_1.NotificationsModule,
        ],
        providers: [reports_service_1.ReportsService, report_generator_service_1.ReportGeneratorService],
        controllers: [reports_controller_1.ReportsController],
        exports: [reports_service_1.ReportsService, report_generator_service_1.ReportGeneratorService],
    })
], ReportsModule);
//# sourceMappingURL=reports.module.js.map