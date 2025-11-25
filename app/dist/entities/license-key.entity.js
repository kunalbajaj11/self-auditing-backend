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
exports.LicenseKey = void 0;
const typeorm_1 = require("typeorm");
const abstract_entity_1 = require("./abstract.entity");
const plan_type_enum_1 = require("../common/enums/plan-type.enum");
const license_key_status_enum_1 = require("../common/enums/license-key-status.enum");
const user_entity_1 = require("./user.entity");
let LicenseKey = class LicenseKey extends abstract_entity_1.AbstractEntity {
};
exports.LicenseKey = LicenseKey;
__decorate([
    (0, typeorm_1.Column)({ unique: true }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], LicenseKey.prototype, "key", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: license_key_status_enum_1.LicenseKeyStatus,
        default: license_key_status_enum_1.LicenseKeyStatus.ACTIVE,
    }),
    __metadata("design:type", String)
], LicenseKey.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: plan_type_enum_1.PlanType,
        nullable: true,
    }),
    __metadata("design:type", String)
], LicenseKey.prototype, "planType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'integer', nullable: true }),
    __metadata("design:type", Number)
], LicenseKey.prototype, "maxUsers", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'integer', nullable: true }),
    __metadata("design:type", Number)
], LicenseKey.prototype, "storageQuotaMb", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp with time zone' }),
    __metadata("design:type", Date)
], LicenseKey.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp with time zone', nullable: true }),
    __metadata("design:type", Date)
], LicenseKey.prototype, "consumedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LicenseKey.prototype, "consumedByOrganizationId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LicenseKey.prototype, "consumedByUserId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LicenseKey.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { nullable: true }),
    __metadata("design:type", user_entity_1.User)
], LicenseKey.prototype, "createdBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LicenseKey.prototype, "createdById", void 0);
exports.LicenseKey = LicenseKey = __decorate([
    (0, typeorm_1.Entity)({ name: 'license_keys' })
], LicenseKey);
//# sourceMappingURL=license-key.entity.js.map