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
exports.Accrual = void 0;
const typeorm_1 = require("typeorm");
const abstract_entity_1 = require("./abstract.entity");
const expense_entity_1 = require("./expense.entity");
const organization_entity_1 = require("./organization.entity");
const accrual_status_enum_1 = require("../common/enums/accrual-status.enum");
let Accrual = class Accrual extends abstract_entity_1.AbstractEntity {
};
exports.Accrual = Accrual;
__decorate([
    (0, typeorm_1.OneToOne)(() => expense_entity_1.Expense, (expense) => expense.accrualDetail, {
        nullable: false,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'expense_id' }),
    __metadata("design:type", expense_entity_1.Expense)
], Accrual.prototype, "expense", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => organization_entity_1.Organization, (organization) => organization.accruals, {
        nullable: false,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'organization_id' }),
    __metadata("design:type", organization_entity_1.Organization)
], Accrual.prototype, "organization", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'vendor_name', length: 200, nullable: true }),
    __metadata("design:type", String)
], Accrual.prototype, "vendorName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2 }),
    __metadata("design:type", String)
], Accrual.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'expected_payment_date', type: 'date' }),
    __metadata("design:type", String)
], Accrual.prototype, "expectedPaymentDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'settlement_date', type: 'date', nullable: true }),
    __metadata("design:type", String)
], Accrual.prototype, "settlementDate", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => expense_entity_1.Expense, {
        nullable: true,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'settlement_expense_id' }),
    __metadata("design:type", expense_entity_1.Expense)
], Accrual.prototype, "settlementExpense", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: accrual_status_enum_1.AccrualStatus,
        default: accrual_status_enum_1.AccrualStatus.PENDING_SETTLEMENT,
    }),
    __metadata("design:type", String)
], Accrual.prototype, "status", void 0);
exports.Accrual = Accrual = __decorate([
    (0, typeorm_1.Entity)({ name: 'accruals' })
], Accrual);
//# sourceMappingURL=accrual.entity.js.map