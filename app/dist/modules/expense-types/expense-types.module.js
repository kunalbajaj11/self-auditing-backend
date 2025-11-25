"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpenseTypesModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const expense_types_service_1 = require("./expense-types.service");
const expense_types_controller_1 = require("./expense-types.controller");
const expense_type_entity_1 = require("../../entities/expense-type.entity");
const organization_entity_1 = require("../../entities/organization.entity");
const user_entity_1 = require("../../entities/user.entity");
const expense_entity_1 = require("../../entities/expense.entity");
let ExpenseTypesModule = class ExpenseTypesModule {
};
exports.ExpenseTypesModule = ExpenseTypesModule;
exports.ExpenseTypesModule = ExpenseTypesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([expense_type_entity_1.ExpenseType, organization_entity_1.Organization, user_entity_1.User, expense_entity_1.Expense]),
        ],
        providers: [expense_types_service_1.ExpenseTypesService],
        controllers: [expense_types_controller_1.ExpenseTypesController],
        exports: [expense_types_service_1.ExpenseTypesService],
    })
], ExpenseTypesModule);
//# sourceMappingURL=expense-types.module.js.map