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
exports.ExpenseType = void 0;
const typeorm_1 = require("typeorm");
const abstract_entity_1 = require("./abstract.entity");
const organization_entity_1 = require("./organization.entity");
const user_entity_1 = require("./user.entity");
const expense_entity_1 = require("./expense.entity");
const category_entity_1 = require("./category.entity");
let ExpenseType = class ExpenseType extends abstract_entity_1.AbstractEntity {
};
exports.ExpenseType = ExpenseType;
__decorate([
    (0, typeorm_1.ManyToOne)(() => organization_entity_1.Organization, (organization) => organization.expenseTypes, {
        nullable: false,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'organization_id' }),
    __metadata("design:type", organization_entity_1.Organization)
], ExpenseType.prototype, "organization", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 100 }),
    __metadata("design:type", String)
], ExpenseType.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], ExpenseType.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_system_default', default: false }),
    __metadata("design:type", Boolean)
], ExpenseType.prototype, "isSystemDefault", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'display_label', length: 100, nullable: true }),
    __metadata("design:type", String)
], ExpenseType.prototype, "displayLabel", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, (user) => user.createdExpenseTypes, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'created_by' }),
    __metadata("design:type", user_entity_1.User)
], ExpenseType.prototype, "createdBy", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => expense_entity_1.Expense, (expense) => expense.expenseType),
    __metadata("design:type", Array)
], ExpenseType.prototype, "expenses", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => category_entity_1.Category, (category) => category.expenseTypeEntity),
    __metadata("design:type", Array)
], ExpenseType.prototype, "categories", void 0);
exports.ExpenseType = ExpenseType = __decorate([
    (0, typeorm_1.Entity)({ name: 'expense_types' }),
    (0, typeorm_1.Unique)(['organization', 'name'])
], ExpenseType);
//# sourceMappingURL=expense-type.entity.js.map