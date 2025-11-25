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
exports.Category = void 0;
const typeorm_1 = require("typeorm");
const abstract_entity_1 = require("./abstract.entity");
const organization_entity_1 = require("./organization.entity");
const user_entity_1 = require("./user.entity");
const expense_entity_1 = require("./expense.entity");
const expense_type_entity_1 = require("./expense-type.entity");
let Category = class Category extends abstract_entity_1.AbstractEntity {
};
exports.Category = Category;
__decorate([
    (0, typeorm_1.ManyToOne)(() => organization_entity_1.Organization, (organization) => organization.categories, {
        nullable: false,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'organization_id' }),
    __metadata("design:type", organization_entity_1.Organization)
], Category.prototype, "organization", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 100 }),
    __metadata("design:type", String)
], Category.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], Category.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_system_default', default: false }),
    __metadata("design:type", Boolean)
], Category.prototype, "isSystemDefault", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'expense_type', length: 50, nullable: true }),
    __metadata("design:type", String)
], Category.prototype, "expenseType", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => expense_type_entity_1.ExpenseType, (expenseType) => expenseType.categories, {
        nullable: true,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'expense_type_id' }),
    __metadata("design:type", expense_type_entity_1.ExpenseType)
], Category.prototype, "expenseTypeEntity", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, (user) => user.createdCategories, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'created_by' }),
    __metadata("design:type", user_entity_1.User)
], Category.prototype, "createdBy", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => expense_entity_1.Expense, (expense) => expense.category),
    __metadata("design:type", Array)
], Category.prototype, "expenses", void 0);
exports.Category = Category = __decorate([
    (0, typeorm_1.Entity)({ name: 'categories' }),
    (0, typeorm_1.Unique)(['organization', 'name'])
], Category);
//# sourceMappingURL=category.entity.js.map