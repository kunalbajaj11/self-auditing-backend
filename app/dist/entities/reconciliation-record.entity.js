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
exports.ReconciliationRecord = void 0;
const typeorm_1 = require("typeorm");
const abstract_entity_1 = require("./abstract.entity");
const organization_entity_1 = require("./organization.entity");
const user_entity_1 = require("./user.entity");
const bank_transaction_entity_1 = require("./bank-transaction.entity");
const system_transaction_entity_1 = require("./system-transaction.entity");
let ReconciliationRecord = class ReconciliationRecord extends abstract_entity_1.AbstractEntity {
};
exports.ReconciliationRecord = ReconciliationRecord;
__decorate([
    (0, typeorm_1.ManyToOne)(() => organization_entity_1.Organization, {
        nullable: false,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'organization_id' }),
    __metadata("design:type", organization_entity_1.Organization)
], ReconciliationRecord.prototype, "organization", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'reconciliation_date', type: 'date' }),
    __metadata("design:type", String)
], ReconciliationRecord.prototype, "reconciliationDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'statement_period_start', type: 'date' }),
    __metadata("design:type", String)
], ReconciliationRecord.prototype, "statementPeriodStart", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'statement_period_end', type: 'date' }),
    __metadata("design:type", String)
], ReconciliationRecord.prototype, "statementPeriodEnd", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_bank_credits', type: 'decimal', precision: 18, scale: 2, default: 0 }),
    __metadata("design:type", String)
], ReconciliationRecord.prototype, "totalBankCredits", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_bank_debits', type: 'decimal', precision: 18, scale: 2, default: 0 }),
    __metadata("design:type", String)
], ReconciliationRecord.prototype, "totalBankDebits", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_matched', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], ReconciliationRecord.prototype, "totalMatched", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_unmatched', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], ReconciliationRecord.prototype, "totalUnmatched", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'adjustments_count', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], ReconciliationRecord.prototype, "adjustmentsCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'closing_balance', type: 'decimal', precision: 18, scale: 2, nullable: true }),
    __metadata("design:type", String)
], ReconciliationRecord.prototype, "closingBalance", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'system_closing_balance', type: 'decimal', precision: 18, scale: 2, nullable: true }),
    __metadata("design:type", String)
], ReconciliationRecord.prototype, "systemClosingBalance", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], ReconciliationRecord.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'created_by' }),
    __metadata("design:type", user_entity_1.User)
], ReconciliationRecord.prototype, "createdBy", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => bank_transaction_entity_1.BankTransaction, (transaction) => transaction.reconciliationRecord),
    __metadata("design:type", Array)
], ReconciliationRecord.prototype, "bankTransactions", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => system_transaction_entity_1.SystemTransaction, (transaction) => transaction.reconciliationRecord),
    __metadata("design:type", Array)
], ReconciliationRecord.prototype, "systemTransactions", void 0);
exports.ReconciliationRecord = ReconciliationRecord = __decorate([
    (0, typeorm_1.Entity)({ name: 'reconciliation_records' }),
    (0, typeorm_1.Index)('idx_reconciliation_records_org_date', ['organization', 'reconciliationDate'])
], ReconciliationRecord);
//# sourceMappingURL=reconciliation-record.entity.js.map