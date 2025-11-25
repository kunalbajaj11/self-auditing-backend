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
exports.Plan = void 0;
const typeorm_1 = require("typeorm");
const abstract_entity_1 = require("./abstract.entity");
const organization_entity_1 = require("./organization.entity");
let Plan = class Plan extends abstract_entity_1.AbstractEntity {
};
exports.Plan = Plan;
__decorate([
    (0, typeorm_1.Column)({ length: 50 }),
    __metadata("design:type", String)
], Plan.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], Plan.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'max_users', type: 'int', nullable: true }),
    __metadata("design:type", Number)
], Plan.prototype, "maxUsers", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'max_storage_mb', type: 'int', nullable: true }),
    __metadata("design:type", Number)
], Plan.prototype, "maxStorageMb", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'max_expenses_per_month', type: 'int', nullable: true }),
    __metadata("design:type", Number)
], Plan.prototype, "maxExpensesPerMonth", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'price_monthly', type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", String)
], Plan.prototype, "priceMonthly", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'price_yearly', type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", String)
], Plan.prototype, "priceYearly", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => organization_entity_1.Organization, (organization) => organization.plan),
    __metadata("design:type", Array)
], Plan.prototype, "organizations", void 0);
exports.Plan = Plan = __decorate([
    (0, typeorm_1.Entity)({ name: 'plans' })
], Plan);
//# sourceMappingURL=plan.entity.js.map