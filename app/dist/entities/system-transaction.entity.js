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
exports.SystemTransaction = void 0;
const typeorm_1 = require("typeorm");
const abstract_entity_1 = require("./abstract.entity");
const organization_entity_1 = require("./organization.entity");
const expense_entity_1 = require("./expense.entity");
const reconciliation_record_entity_1 = require("./reconciliation-record.entity");
const reconciliation_status_enum_1 = require("../common/enums/reconciliation-status.enum");
const transaction_type_enum_1 = require("../common/enums/transaction-type.enum");
let SystemTransaction = class SystemTransaction extends abstract_entity_1.AbstractEntity {
};
exports.SystemTransaction = SystemTransaction;
__decorate([
    (0, typeorm_1.ManyToOne)(() => organization_entity_1.Organization, {
        nullable: false,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'organization_id' }),
    __metadata("design:type", organization_entity_1.Organization)
], SystemTransaction.prototype, "organization", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'transaction_date', type: 'date' }),
    __metadata("design:type", String)
], SystemTransaction.prototype, "transactionDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], SystemTransaction.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2 }),
    __metadata("design:type", String)
], SystemTransaction.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: transaction_type_enum_1.TransactionType,
    }),
    __metadata("design:type", String)
], SystemTransaction.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => expense_entity_1.Expense, {
        nullable: true,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'expense_id' }),
    __metadata("design:type", expense_entity_1.Expense)
], SystemTransaction.prototype, "expense", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: reconciliation_status_enum_1.ReconciliationStatus,
        default: reconciliation_status_enum_1.ReconciliationStatus.UNMATCHED,
    }),
    __metadata("design:type", String)
], SystemTransaction.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => reconciliation_record_entity_1.ReconciliationRecord, (record) => record.systemTransactions, {
        nullable: true,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'reconciliation_record_id' }),
    __metadata("design:type", reconciliation_record_entity_1.ReconciliationRecord)
], SystemTransaction.prototype, "reconciliationRecord", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'source', type: 'varchar', length: 50, default: 'expense' }),
    __metadata("design:type", String)
], SystemTransaction.prototype, "source", void 0);
exports.SystemTransaction = SystemTransaction = __decorate([
    (0, typeorm_1.Entity)({ name: 'system_transactions' }),
    (0, typeorm_1.Index)('idx_system_transactions_org_date', ['organization', 'transactionDate']),
    (0, typeorm_1.Index)('idx_system_transactions_status', ['status'])
], SystemTransaction);
//# sourceMappingURL=system-transaction.entity.js.map