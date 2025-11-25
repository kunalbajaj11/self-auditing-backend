"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccrualsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const accruals_service_1 = require("./accruals.service");
const accruals_controller_1 = require("./accruals.controller");
const accrual_entity_1 = require("../../entities/accrual.entity");
let AccrualsModule = class AccrualsModule {
};
exports.AccrualsModule = AccrualsModule;
exports.AccrualsModule = AccrualsModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([accrual_entity_1.Accrual])],
        providers: [accruals_service_1.AccrualsService],
        controllers: [accruals_controller_1.AccrualsController],
        exports: [accruals_service_1.AccrualsService],
    })
], AccrualsModule);
//# sourceMappingURL=accruals.module.js.map