"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseKeysModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const license_keys_service_1 = require("./license-keys.service");
const license_keys_controller_1 = require("./license-keys.controller");
const license_key_entity_1 = require("../../entities/license-key.entity");
let LicenseKeysModule = class LicenseKeysModule {
};
exports.LicenseKeysModule = LicenseKeysModule;
exports.LicenseKeysModule = LicenseKeysModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([license_key_entity_1.LicenseKey])],
        providers: [license_keys_service_1.LicenseKeysService],
        controllers: [license_keys_controller_1.LicenseKeysController],
        exports: [license_keys_service_1.LicenseKeysService],
    })
], LicenseKeysModule);
//# sourceMappingURL=license-keys.module.js.map