"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForexModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const forex_rate_service_1 = require("./forex-rate.service");
const exchange_rate_entity_1 = require("../../entities/exchange-rate.entity");
let ForexModule = class ForexModule {
};
exports.ForexModule = ForexModule;
exports.ForexModule = ForexModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([exchange_rate_entity_1.ExchangeRate])],
        providers: [forex_rate_service_1.ForexRateService],
        exports: [forex_rate_service_1.ForexRateService],
    })
], ForexModule);
//# sourceMappingURL=forex.module.js.map