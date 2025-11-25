"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BankReconciliationModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const bank_reconciliation_controller_1 = require("./bank-reconciliation.controller");
const reconciliation_service_1 = require("./reconciliation.service");
const reconciliation_report_service_1 = require("./reconciliation-report.service");
const bank_statement_parser_service_1 = require("./bank-statement-parser.service");
const bank_transaction_entity_1 = require("../../entities/bank-transaction.entity");
const system_transaction_entity_1 = require("../../entities/system-transaction.entity");
const reconciliation_record_entity_1 = require("../../entities/reconciliation-record.entity");
const expense_entity_1 = require("../../entities/expense.entity");
const organization_entity_1 = require("../../entities/organization.entity");
const user_entity_1 = require("../../entities/user.entity");
const category_entity_1 = require("../../entities/category.entity");
const attachments_module_1 = require("../attachments/attachments.module");
const expenses_module_1 = require("../expenses/expenses.module");
let BankReconciliationModule = class BankReconciliationModule {
};
exports.BankReconciliationModule = BankReconciliationModule;
exports.BankReconciliationModule = BankReconciliationModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                bank_transaction_entity_1.BankTransaction,
                system_transaction_entity_1.SystemTransaction,
                reconciliation_record_entity_1.ReconciliationRecord,
                expense_entity_1.Expense,
                organization_entity_1.Organization,
                user_entity_1.User,
                category_entity_1.Category,
            ]),
            attachments_module_1.AttachmentsModule,
            expenses_module_1.ExpensesModule,
        ],
        controllers: [bank_reconciliation_controller_1.BankReconciliationController],
        providers: [
            reconciliation_service_1.ReconciliationService,
            reconciliation_report_service_1.ReconciliationReportService,
            bank_statement_parser_service_1.BankStatementParserService,
        ],
        exports: [reconciliation_service_1.ReconciliationService, reconciliation_report_service_1.ReconciliationReportService],
    })
], BankReconciliationModule);
//# sourceMappingURL=bank-reconciliation.module.js.map