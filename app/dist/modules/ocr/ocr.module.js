"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OcrModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const ocr_service_1 = require("./ocr.service");
const ocr_controller_1 = require("./ocr.controller");
const category_detection_service_1 = require("./category-detection.service");
const category_entity_1 = require("../../entities/category.entity");
let OcrModule = class OcrModule {
};
exports.OcrModule = OcrModule;
exports.OcrModule = OcrModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([category_entity_1.Category])],
        providers: [ocr_service_1.OcrService, category_detection_service_1.CategoryDetectionService],
        controllers: [ocr_controller_1.OcrController],
        exports: [ocr_service_1.OcrService],
    })
], OcrModule);
//# sourceMappingURL=ocr.module.js.map