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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlansService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const plan_entity_1 = require("../../entities/plan.entity");
let PlansService = class PlansService {
    constructor(plansRepository) {
        this.plansRepository = plansRepository;
    }
    async create(dto) {
        const plan = this.plansRepository.create({
            ...dto,
            priceMonthly: dto.priceMonthly !== undefined
                ? dto.priceMonthly.toFixed(2)
                : null,
            priceYearly: dto.priceYearly !== undefined
                ? dto.priceYearly.toFixed(2)
                : null,
        });
        return this.plansRepository.save(plan);
    }
    async findAll() {
        return this.plansRepository.find({
            order: { createdAt: 'DESC' },
        });
    }
    async findById(id) {
        const plan = await this.plansRepository.findOne({ where: { id } });
        if (!plan) {
            throw new common_1.NotFoundException(`Plan ${id} not found`);
        }
        return plan;
    }
    async update(id, dto) {
        const plan = await this.findById(id);
        Object.assign(plan, {
            ...dto,
            priceMonthly: dto.priceMonthly !== undefined
                ? dto.priceMonthly.toFixed(2)
                : plan.priceMonthly,
            priceYearly: dto.priceYearly !== undefined
                ? dto.priceYearly.toFixed(2)
                : plan.priceYearly,
        });
        return this.plansRepository.save(plan);
    }
    async delete(id) {
        const plan = await this.findById(id);
        await this.plansRepository.remove(plan);
    }
};
exports.PlansService = PlansService;
exports.PlansService = PlansService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(plan_entity_1.Plan)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], PlansService);
//# sourceMappingURL=plans.service.js.map