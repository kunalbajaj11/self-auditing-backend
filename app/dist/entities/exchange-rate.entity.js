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
exports.ExchangeRate = void 0;
const typeorm_1 = require("typeorm");
const abstract_entity_1 = require("./abstract.entity");
const organization_entity_1 = require("./organization.entity");
let ExchangeRate = class ExchangeRate extends abstract_entity_1.AbstractEntity {
};
exports.ExchangeRate = ExchangeRate;
__decorate([
    (0, typeorm_1.ManyToOne)(() => organization_entity_1.Organization, (organization) => organization.exchangeRates, {
        nullable: false,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'organization_id' }),
    __metadata("design:type", organization_entity_1.Organization)
], ExchangeRate.prototype, "organization", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'from_currency', length: 10 }),
    __metadata("design:type", String)
], ExchangeRate.prototype, "fromCurrency", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'to_currency', length: 10 }),
    __metadata("design:type", String)
], ExchangeRate.prototype, "toCurrency", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 6 }),
    __metadata("design:type", String)
], ExchangeRate.prototype, "rate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date' }),
    __metadata("design:type", String)
], ExchangeRate.prototype, "date", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 50, default: 'manual' }),
    __metadata("design:type", String)
], ExchangeRate.prototype, "source", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_active', default: true }),
    __metadata("design:type", Boolean)
], ExchangeRate.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_manual', default: false }),
    __metadata("design:type", Boolean)
], ExchangeRate.prototype, "isManual", void 0);
exports.ExchangeRate = ExchangeRate = __decorate([
    (0, typeorm_1.Entity)({ name: 'exchange_rates' }),
    (0, typeorm_1.Index)(['organization', 'fromCurrency', 'toCurrency', 'date'], { unique: true })
], ExchangeRate);
//# sourceMappingURL=exchange-rate.entity.js.map