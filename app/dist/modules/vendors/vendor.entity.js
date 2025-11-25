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
exports.Vendor = void 0;
const typeorm_1 = require("typeorm");
const abstract_entity_1 = require("../../entities/abstract.entity");
const organization_entity_1 = require("../../entities/organization.entity");
const expense_entity_1 = require("../../entities/expense.entity");
let Vendor = class Vendor extends abstract_entity_1.AbstractEntity {
};
exports.Vendor = Vendor;
__decorate([
    (0, typeorm_1.ManyToOne)(() => organization_entity_1.Organization, (organization) => organization.vendors, {
        nullable: false,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'organization_id' }),
    __metadata("design:type", organization_entity_1.Organization)
], Vendor.prototype, "organization", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 200 }),
    __metadata("design:type", String)
], Vendor.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'display_name', length: 200, nullable: true }),
    __metadata("design:type", String)
], Vendor.prototype, "displayName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'vendor_trn', length: 50, nullable: true }),
    __metadata("design:type", String)
], Vendor.prototype, "vendorTrn", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'vendor_category', length: 100, nullable: true }),
    __metadata("design:type", String)
], Vendor.prototype, "category", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], Vendor.prototype, "address", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 100, nullable: true }),
    __metadata("design:type", String)
], Vendor.prototype, "city", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 50, nullable: true }),
    __metadata("design:type", String)
], Vendor.prototype, "country", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 20, nullable: true }),
    __metadata("design:type", String)
], Vendor.prototype, "phone", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 100, nullable: true }),
    __metadata("design:type", String)
], Vendor.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 10, nullable: true }),
    __metadata("design:type", String)
], Vendor.prototype, "website", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'contact_person', length: 100, nullable: true }),
    __metadata("design:type", String)
], Vendor.prototype, "contactPerson", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'preferred_currency', length: 10, default: 'AED' }),
    __metadata("design:type", String)
], Vendor.prototype, "preferredCurrency", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'payment_terms', type: 'int', nullable: true }),
    __metadata("design:type", Number)
], Vendor.prototype, "paymentTerms", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_active', default: true }),
    __metadata("design:type", Boolean)
], Vendor.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], Vendor.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => expense_entity_1.Expense, (expense) => expense.vendor),
    __metadata("design:type", Array)
], Vendor.prototype, "expenses", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'first_used_at', type: 'timestamp', nullable: true }),
    __metadata("design:type", Date)
], Vendor.prototype, "firstUsedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_used_at', type: 'timestamp', nullable: true }),
    __metadata("design:type", Date)
], Vendor.prototype, "lastUsedAt", void 0);
exports.Vendor = Vendor = __decorate([
    (0, typeorm_1.Entity)({ name: 'vendors' }),
    (0, typeorm_1.Unique)(['organization', 'name']),
    (0, typeorm_1.Index)(['organization', 'name'])
], Vendor);
//# sourceMappingURL=vendor.entity.js.map