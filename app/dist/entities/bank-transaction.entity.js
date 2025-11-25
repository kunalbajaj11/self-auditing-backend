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
exports.BankTransaction = void 0;
const typeorm_1 = require("typeorm");
const abstract_entity_1 = require("./abstract.entity");
const organization_entity_1 = require("./organization.entity");
const user_entity_1 = require("./user.entity");
const transaction_type_enum_1 = require("../common/enums/transaction-type.enum");
const reconciliation_status_enum_1 = require("../common/enums/reconciliation-status.enum");
const reconciliation_record_entity_1 = require("./reconciliation-record.entity");
let BankTransaction = class BankTransaction extends abstract_entity_1.AbstractEntity {
};
exports.BankTransaction = BankTransaction;
__decorate([
    (0, typeorm_1.ManyToOne)(() => organization_entity_1.Organization, {
        nullable: false,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'organization_id' }),
    __metadata("design:type", organization_entity_1.Organization)
], BankTransaction.prototype, "organization", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'transaction_date', type: 'date' }),
    __metadata("design:type", String)
], BankTransaction.prototype, "transactionDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], BankTransaction.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2 }),
    __metadata("design:type", String)
], BankTransaction.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: transaction_type_enum_1.TransactionType,
    }),
    __metadata("design:type", String)
], BankTransaction.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, nullable: true }),
    __metadata("design:type", String)
], BankTransaction.prototype, "balance", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], BankTransaction.prototype, "reference", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'source_file', type: 'text' }),
    __metadata("design:type", String)
], BankTransaction.prototype, "sourceFile", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: reconciliation_status_enum_1.ReconciliationStatus,
        default: reconciliation_status_enum_1.ReconciliationStatus.UNMATCHED,
    }),
    __metadata("design:type", String)
], BankTransaction.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => reconciliation_record_entity_1.ReconciliationRecord, (record) => record.bankTransactions, {
        nullable: true,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'reconciliation_record_id' }),
    __metadata("design:type", reconciliation_record_entity_1.ReconciliationRecord)
], BankTransaction.prototype, "reconciliationRecord", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'uploaded_by' }),
    __metadata("design:type", user_entity_1.User)
], BankTransaction.prototype, "uploadedBy", void 0);
exports.BankTransaction = BankTransaction = __decorate([
    (0, typeorm_1.Entity)({ name: 'bank_transactions' }),
    (0, typeorm_1.Index)('idx_bank_transactions_org_date', ['organization', 'transactionDate']),
    (0, typeorm_1.Index)('idx_bank_transactions_status', ['status'])
], BankTransaction);
//# sourceMappingURL=bank-transaction.entity.js.map