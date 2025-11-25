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
exports.SuperAdminService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const organization_entity_1 = require("../../entities/organization.entity");
const expense_entity_1 = require("../../entities/expense.entity");
const user_entity_1 = require("../../entities/user.entity");
const attachment_entity_1 = require("../../entities/attachment.entity");
const accrual_entity_1 = require("../../entities/accrual.entity");
const audit_log_entity_1 = require("../../entities/audit-log.entity");
const accrual_status_enum_1 = require("../../common/enums/accrual-status.enum");
const organization_status_enum_1 = require("../../common/enums/organization-status.enum");
const expense_status_enum_1 = require("../../common/enums/expense-status.enum");
const CACHE_TTL_MS = 5 * 60 * 1000;
let SuperAdminService = class SuperAdminService {
    constructor(organizationsRepository, expensesRepository, usersRepository, attachmentsRepository, accrualsRepository, auditLogsRepository) {
        this.organizationsRepository = organizationsRepository;
        this.expensesRepository = expensesRepository;
        this.usersRepository = usersRepository;
        this.attachmentsRepository = attachmentsRepository;
        this.accrualsRepository = accrualsRepository;
        this.auditLogsRepository = auditLogsRepository;
        this.dashboardMetricsCache = null;
        this.organizationUsageCache = null;
    }
    isCacheValid(cache) {
        if (!cache)
            return false;
        return Date.now() - cache.timestamp < CACHE_TTL_MS;
    }
    async getDashboardMetrics(forceRefresh = false) {
        if (!forceRefresh && this.isCacheValid(this.dashboardMetricsCache)) {
            return this.dashboardMetricsCache.data;
        }
        const [totalOrganizations, activeOrganizations, totalUsers, totalExpensesProcessed, totalAccruals, pendingAccruals, attachmentsSum, latestAuditLogs,] = await Promise.all([
            this.organizationsRepository.count(),
            this.organizationsRepository.count({
                where: { status: organization_status_enum_1.OrganizationStatus.ACTIVE },
            }),
            this.usersRepository.count({
                where: { isDeleted: false },
            }),
            this.expensesRepository.count({
                where: {
                    isDeleted: false,
                    status: (0, typeorm_2.Not)(expense_status_enum_1.ExpenseStatus.PENDING),
                },
            }),
            this.accrualsRepository.count({
                where: { isDeleted: false },
            }),
            this.accrualsRepository.count({
                where: {
                    status: accrual_status_enum_1.AccrualStatus.PENDING_SETTLEMENT,
                    isDeleted: false,
                },
            }),
            this.getTotalAttachmentSize(),
            this.getLatestAuditLogs(10),
        ]);
        const inactiveOrganizations = totalOrganizations - activeOrganizations;
        const metrics = {
            totalOrganizations,
            activeOrganizations,
            inactiveOrganizations,
            totalUsers,
            totalExpensesProcessed,
            totalAccruals,
            pendingAccruals,
            storageUsedMb: attachmentsSum,
            latestAuditLogs: latestAuditLogs.map((log) => ({
                id: log.id,
                organizationId: log.organization?.id ?? 'global',
                entityType: log.entityType,
                action: log.action,
                timestamp: log.timestamp.toISOString(),
            })),
        };
        this.dashboardMetricsCache = {
            data: metrics,
            timestamp: Date.now(),
        };
        return metrics;
    }
    async getOrganizationUsage(forceRefresh = false) {
        if (!forceRefresh && this.isCacheValid(this.organizationUsageCache)) {
            return this.organizationUsageCache.data;
        }
        const organizations = await this.organizationsRepository.find({
            order: { createdAt: 'DESC' },
        });
        const usage = await Promise.all(organizations.map(async (organization) => {
            const [userCount, expenseCount, accrualCount, storageMb] = await Promise.all([
                this.usersRepository.count({
                    where: {
                        organization: { id: organization.id },
                        isDeleted: false,
                    },
                }),
                this.expensesRepository.count({
                    where: {
                        organization: { id: organization.id },
                        isDeleted: false,
                        status: (0, typeorm_2.Not)(expense_status_enum_1.ExpenseStatus.PENDING),
                    },
                }),
                this.accrualsRepository.count({
                    where: {
                        organization: { id: organization.id },
                        isDeleted: false,
                    },
                }),
                this.getTotalAttachmentSize(organization.id),
            ]);
            const rankingScore = expenseCount * 0.5 + userCount * 0.3 + accrualCount * 0.2;
            return {
                id: organization.id,
                name: organization.name,
                planType: organization.planType,
                status: organization.status,
                userCount,
                expenseCount,
                accrualCount,
                storageUsedMb: storageMb,
                rankingScore,
                createdAt: organization.createdAt,
            };
        }));
        this.organizationUsageCache = {
            data: usage,
            timestamp: Date.now(),
        };
        return usage;
    }
    async getLatestAuditLogs(limit = 10, skip = 0) {
        return this.auditLogsRepository.find({
            take: limit,
            skip,
            order: { timestamp: 'DESC' },
            relations: ['organization'],
            where: { isDeleted: false },
        });
    }
    async getTotalAttachmentSize(organizationId) {
        const query = this.attachmentsRepository
            .createQueryBuilder('attachment')
            .select('COALESCE(SUM(attachment.file_size), 0)', 'total')
            .andWhere('attachment.is_deleted = false');
        if (organizationId) {
            query.where('attachment.organization_id = :organizationId', {
                organizationId,
            });
        }
        const result = await query.getRawOne();
        const totalBytes = Number(result?.total ?? 0);
        return Number((totalBytes / (1024 * 1024)).toFixed(2));
    }
};
exports.SuperAdminService = SuperAdminService;
exports.SuperAdminService = SuperAdminService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(organization_entity_1.Organization)),
    __param(1, (0, typeorm_1.InjectRepository)(expense_entity_1.Expense)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(3, (0, typeorm_1.InjectRepository)(attachment_entity_1.Attachment)),
    __param(4, (0, typeorm_1.InjectRepository)(accrual_entity_1.Accrual)),
    __param(5, (0, typeorm_1.InjectRepository)(audit_log_entity_1.AuditLog)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], SuperAdminService);
//# sourceMappingURL=super-admin.service.js.map