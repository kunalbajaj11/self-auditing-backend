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
exports.Organization = void 0;
const typeorm_1 = require("typeorm");
const abstract_entity_1 = require("./abstract.entity");
const plan_type_enum_1 = require("../common/enums/plan-type.enum");
const organization_status_enum_1 = require("../common/enums/organization-status.enum");
const user_entity_1 = require("./user.entity");
const category_entity_1 = require("./category.entity");
const expense_entity_1 = require("./expense.entity");
const attachment_entity_1 = require("./attachment.entity");
const accrual_entity_1 = require("./accrual.entity");
const notification_entity_1 = require("./notification.entity");
const report_entity_1 = require("./report.entity");
const audit_log_entity_1 = require("./audit-log.entity");
const plan_entity_1 = require("./plan.entity");
const expense_type_entity_1 = require("./expense-type.entity");
const exchange_rate_entity_1 = require("./exchange-rate.entity");
const vendor_entity_1 = require("../modules/vendors/vendor.entity");
let Organization = class Organization extends abstract_entity_1.AbstractEntity {
};
exports.Organization = Organization;
__decorate([
    (0, typeorm_1.Column)({ length: 150 }),
    __metadata("design:type", String)
], Organization.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'vat_number', length: 50, nullable: true }),
    __metadata("design:type", String)
], Organization.prototype, "vatNumber", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], Organization.prototype, "address", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 10, default: 'AED' }),
    __metadata("design:type", String)
], Organization.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'base_currency', length: 10, default: 'AED' }),
    __metadata("design:type", String)
], Organization.prototype, "baseCurrency", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'fiscal_year_start', type: 'date', nullable: true }),
    __metadata("design:type", String)
], Organization.prototype, "fiscalYearStart", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'plan_type',
        type: 'enum',
        enum: plan_type_enum_1.PlanType,
        default: plan_type_enum_1.PlanType.FREE,
    }),
    __metadata("design:type", String)
], Organization.prototype, "planType", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: organization_status_enum_1.OrganizationStatus,
        default: organization_status_enum_1.OrganizationStatus.ACTIVE,
    }),
    __metadata("design:type", String)
], Organization.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'contact_person', length: 100, nullable: true }),
    __metadata("design:type", String)
], Organization.prototype, "contactPerson", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'contact_email', length: 100, nullable: true }),
    __metadata("design:type", String)
], Organization.prototype, "contactEmail", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'storage_quota_mb', type: 'int', default: 500 }),
    __metadata("design:type", Number)
], Organization.prototype, "storageQuotaMb", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => plan_entity_1.Plan, (plan) => plan.organizations, {
        nullable: true,
        eager: false,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'plan_id' }),
    __metadata("design:type", plan_entity_1.Plan)
], Organization.prototype, "plan", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => user_entity_1.User, (user) => user.organization),
    __metadata("design:type", Array)
], Organization.prototype, "users", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => category_entity_1.Category, (category) => category.organization),
    __metadata("design:type", Array)
], Organization.prototype, "categories", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => expense_entity_1.Expense, (expense) => expense.organization),
    __metadata("design:type", Array)
], Organization.prototype, "expenses", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => expense_type_entity_1.ExpenseType, (expenseType) => expenseType.organization),
    __metadata("design:type", Array)
], Organization.prototype, "expenseTypes", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => attachment_entity_1.Attachment, (attachment) => attachment.organization),
    __metadata("design:type", Array)
], Organization.prototype, "attachments", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => accrual_entity_1.Accrual, (accrual) => accrual.organization),
    __metadata("design:type", Array)
], Organization.prototype, "accruals", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => notification_entity_1.Notification, (notification) => notification.organization),
    __metadata("design:type", Array)
], Organization.prototype, "notifications", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => report_entity_1.Report, (report) => report.organization),
    __metadata("design:type", Array)
], Organization.prototype, "reports", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => audit_log_entity_1.AuditLog, (auditLog) => auditLog.organization),
    __metadata("design:type", Array)
], Organization.prototype, "auditLogs", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => exchange_rate_entity_1.ExchangeRate, (exchangeRate) => exchangeRate.organization),
    __metadata("design:type", Array)
], Organization.prototype, "exchangeRates", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => vendor_entity_1.Vendor, (vendor) => vendor.organization),
    __metadata("design:type", Array)
], Organization.prototype, "vendors", void 0);
exports.Organization = Organization = __decorate([
    (0, typeorm_1.Entity)({ name: 'organizations' }),
    (0, typeorm_1.Unique)(['name'])
], Organization);
//# sourceMappingURL=organization.entity.js.map