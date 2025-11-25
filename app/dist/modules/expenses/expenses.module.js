"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpensesModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const expenses_service_1 = require("./expenses.service");
const expenses_controller_1 = require("./expenses.controller");
const expense_entity_1 = require("../../entities/expense.entity");
const organization_entity_1 = require("../../entities/organization.entity");
const user_entity_1 = require("../../entities/user.entity");
const category_entity_1 = require("../../entities/category.entity");
const attachment_entity_1 = require("../../entities/attachment.entity");
const accrual_entity_1 = require("../../entities/accrual.entity");
const notifications_module_1 = require("../notifications/notifications.module");
const attachments_module_1 = require("../attachments/attachments.module");
const forex_module_1 = require("../forex/forex.module");
const duplicates_module_1 = require("../duplicates/duplicates.module");
const vendors_module_1 = require("../vendors/vendors.module");
const vendor_entity_1 = require("../vendors/vendor.entity");
let ExpensesModule = class ExpensesModule {
};
exports.ExpensesModule = ExpensesModule;
exports.ExpensesModule = ExpensesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                expense_entity_1.Expense,
                organization_entity_1.Organization,
                user_entity_1.User,
                category_entity_1.Category,
                attachment_entity_1.Attachment,
                accrual_entity_1.Accrual,
                vendor_entity_1.Vendor,
            ]),
            notifications_module_1.NotificationsModule,
            attachments_module_1.AttachmentsModule,
            forex_module_1.ForexModule,
            duplicates_module_1.DuplicatesModule,
            vendors_module_1.VendorsModule,
        ],
        providers: [expenses_service_1.ExpensesService],
        controllers: [expenses_controller_1.ExpensesController],
        exports: [expenses_service_1.ExpensesService],
    })
], ExpensesModule);
//# sourceMappingURL=expenses.module.js.map