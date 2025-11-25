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
exports.AccrualsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const accrual_entity_1 = require("../../entities/accrual.entity");
const accrual_status_enum_1 = require("../../common/enums/accrual-status.enum");
let AccrualsService = class AccrualsService {
    constructor(accrualsRepository) {
        this.accrualsRepository = accrualsRepository;
    }
    async findAll(organizationId, filters) {
        const query = this.accrualsRepository
            .createQueryBuilder('accrual')
            .leftJoinAndSelect('accrual.expense', 'expense')
            .leftJoinAndSelect('accrual.settlementExpense', 'settlementExpense')
            .where('accrual.organization_id = :organizationId', { organizationId });
        if (filters.status) {
            query.andWhere('accrual.status = :status', { status: filters.status });
        }
        if (filters.startDate) {
            query.andWhere('accrual.expected_payment_date >= :startDate', {
                startDate: filters.startDate,
            });
        }
        if (filters.endDate) {
            query.andWhere('accrual.expected_payment_date <= :endDate', {
                endDate: filters.endDate,
            });
        }
        query.orderBy('accrual.expected_payment_date', 'ASC');
        return query.getMany();
    }
    async findById(organizationId, id) {
        const accrual = await this.accrualsRepository.findOne({
            where: { id, organization: { id: organizationId } },
            relations: ['expense', 'settlementExpense'],
        });
        if (!accrual) {
            throw new common_1.NotFoundException('Accrual not found');
        }
        return accrual;
    }
    async pendingCount(organizationId) {
        return this.accrualsRepository.count({
            where: {
                organization: { id: organizationId },
                status: accrual_status_enum_1.AccrualStatus.PENDING_SETTLEMENT,
            },
        });
    }
};
exports.AccrualsService = AccrualsService;
exports.AccrualsService = AccrualsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(accrual_entity_1.Accrual)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], AccrualsService);
//# sourceMappingURL=accruals.service.js.map