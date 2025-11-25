"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const database_config_1 = require("./config/database.config");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const auth_module_1 = require("./modules/auth/auth.module");
const users_module_1 = require("./modules/users/users.module");
const organizations_module_1 = require("./modules/organizations/organizations.module");
const categories_module_1 = require("./modules/categories/categories.module");
const expense_types_module_1 = require("./modules/expense-types/expense-types.module");
const expenses_module_1 = require("./modules/expenses/expenses.module");
const accruals_module_1 = require("./modules/accruals/accruals.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
const reports_module_1 = require("./modules/reports/reports.module");
const audit_logs_module_1 = require("./modules/audit-logs/audit-logs.module");
const plans_module_1 = require("./modules/plans/plans.module");
const ocr_module_1 = require("./modules/ocr/ocr.module");
const super_admin_module_1 = require("./modules/super-admin/super-admin.module");
const license_keys_module_1 = require("./modules/license-keys/license-keys.module");
const attachments_module_1 = require("./modules/attachments/attachments.module");
const scheduler_module_1 = require("./modules/scheduler/scheduler.module");
const bank_reconciliation_module_1 = require("./modules/bank-reconciliation/bank-reconciliation.module");
const forex_module_1 = require("./modules/forex/forex.module");
const duplicates_module_1 = require("./modules/duplicates/duplicates.module");
const vendors_module_1 = require("./modules/vendors/vendors.module");
const app_bootstrap_service_1 = require("./bootstrap/app-bootstrap.service");
const sanitize_attachments_interceptor_1 = require("./common/interceptors/sanitize-attachments.interceptor");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                load: [database_config_1.default],
                envFilePath: ['.env'],
            }),
            typeorm_1.TypeOrmModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    ...configService.get('database'),
                    autoLoadEntities: true,
                }),
            }),
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            organizations_module_1.OrganizationsModule,
            categories_module_1.CategoriesModule,
            expense_types_module_1.ExpenseTypesModule,
            expenses_module_1.ExpensesModule,
            accruals_module_1.AccrualsModule,
            notifications_module_1.NotificationsModule,
            reports_module_1.ReportsModule,
            audit_logs_module_1.AuditLogsModule,
            plans_module_1.PlansModule,
            ocr_module_1.OcrModule,
            super_admin_module_1.SuperAdminModule,
            license_keys_module_1.LicenseKeysModule,
            attachments_module_1.AttachmentsModule,
            scheduler_module_1.SchedulerModule,
            bank_reconciliation_module_1.BankReconciliationModule,
            forex_module_1.ForexModule,
            duplicates_module_1.DuplicatesModule,
            vendors_module_1.VendorsModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [
            app_service_1.AppService,
            app_bootstrap_service_1.AppBootstrapService,
            {
                provide: core_1.APP_INTERCEPTOR,
                useClass: sanitize_attachments_interceptor_1.SanitizeAttachmentsInterceptor,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map