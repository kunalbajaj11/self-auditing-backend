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
exports.Expense = void 0;
const typeorm_1 = require("typeorm");
const abstract_entity_1 = require("./abstract.entity");
const organization_entity_1 = require("./organization.entity");
const user_entity_1 = require("./user.entity");
const category_entity_1 = require("./category.entity");
const expense_type_enum_1 = require("../common/enums/expense-type.enum");
const expense_status_enum_1 = require("../common/enums/expense-status.enum");
const attachment_entity_1 = require("./attachment.entity");
const accrual_entity_1 = require("./accrual.entity");
const expense_source_enum_1 = require("../common/enums/expense-source.enum");
const expense_type_entity_1 = require("./expense-type.entity");
const vendor_entity_1 = require("../modules/vendors/vendor.entity");
let Expense = class Expense extends abstract_entity_1.AbstractEntity {
};
exports.Expense = Expense;
__decorate([
    (0, typeorm_1.ManyToOne)(() => organization_entity_1.Organization, (organization) => organization.expenses, {
        nullable: false,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'organization_id' }),
    __metadata("design:type", organization_entity_1.Organization)
], Expense.prototype, "organization", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, (user) => user.expenses, {
        nullable: false,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'user_id' }),
    __metadata("design:type", user_entity_1.User)
], Expense.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: expense_type_enum_1.ExpenseType,
        nullable: true,
    }),
    __metadata("design:type", String)
], Expense.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => expense_type_entity_1.ExpenseType, (expenseType) => expenseType.expenses, {
        nullable: true,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'expense_type_id' }),
    __metadata("design:type", expense_type_entity_1.ExpenseType)
], Expense.prototype, "expenseType", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => category_entity_1.Category, (category) => category.expenses, {
        nullable: true,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'category_id' }),
    __metadata("design:type", category_entity_1.Category)
], Expense.prototype, "category", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => vendor_entity_1.Vendor, (vendor) => vendor.expenses, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'vendor_id' }),
    __metadata("design:type", vendor_entity_1.Vendor)
], Expense.prototype, "vendor", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'vendor_name', length: 200, nullable: true }),
    __metadata("design:type", String)
], Expense.prototype, "vendorName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'vendor_trn', length: 50, nullable: true }),
    __metadata("design:type", String)
], Expense.prototype, "vendorTrn", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], Expense.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2 }),
    __metadata("design:type", String)
], Expense.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'vat_amount',
        type: 'decimal',
        precision: 12,
        scale: 2,
        default: 0,
    }),
    __metadata("design:type", String)
], Expense.prototype, "vatAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'total_amount',
        type: 'decimal',
        precision: 12,
        scale: 2,
        generatedType: 'STORED',
        asExpression: '"amount" + "vat_amount"',
    }),
    __metadata("design:type", String)
], Expense.prototype, "totalAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 10, default: 'AED' }),
    __metadata("design:type", String)
], Expense.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'exchange_rate', type: 'decimal', precision: 12, scale: 6, nullable: true }),
    __metadata("design:type", String)
], Expense.prototype, "exchangeRate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'base_amount', type: 'decimal', precision: 12, scale: 2, nullable: true }),
    __metadata("design:type", String)
], Expense.prototype, "baseAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'fx_gain_loss', type: 'decimal', precision: 12, scale: 2, nullable: true }),
    __metadata("design:type", String)
], Expense.prototype, "fxGainLoss", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'expense_date', type: 'date' }),
    __metadata("design:type", String)
], Expense.prototype, "expenseDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'expected_payment_date', type: 'date', nullable: true }),
    __metadata("design:type", String)
], Expense.prototype, "expectedPaymentDate", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: expense_status_enum_1.ExpenseStatus,
        default: expense_status_enum_1.ExpenseStatus.PENDING,
    }),
    __metadata("design:type", String)
], Expense.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Expense, (expense) => expense.linkedExpenses, {
        nullable: true,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'linked_accrual_id' }),
    __metadata("design:type", Expense)
], Expense.prototype, "linkedAccrual", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => Expense, (expense) => expense.linkedAccrual),
    __metadata("design:type", Array)
], Expense.prototype, "linkedExpenses", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'ocr_confidence',
        type: 'decimal',
        precision: 5,
        scale: 2,
        nullable: true,
    }),
    __metadata("design:type", String)
], Expense.prototype, "ocrConfidence", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: expense_source_enum_1.ExpenseSource,
        default: expense_source_enum_1.ExpenseSource.MANUAL,
    }),
    __metadata("design:type", String)
], Expense.prototype, "source", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => attachment_entity_1.Attachment, (attachment) => attachment.expense, {
        cascade: true,
    }),
    __metadata("design:type", Array)
], Expense.prototype, "attachments", void 0);
__decorate([
    (0, typeorm_1.OneToOne)(() => accrual_entity_1.Accrual, (accrual) => accrual.expense, {
        cascade: true,
    }),
    __metadata("design:type", accrual_entity_1.Accrual)
], Expense.prototype, "accrualDetail", void 0);
exports.Expense = Expense = __decorate([
    (0, typeorm_1.Entity)({ name: 'expenses' })
], Expense);
//# sourceMappingURL=expense.entity.js.map