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
exports.ReportsController = void 0;
const common_1 = require("@nestjs/common");
const reports_service_1 = require("./reports.service");
const report_generator_service_1 = require("./report-generator.service");
const email_service_1 = require("../notifications/email.service");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const organization_entity_1 = require("../../entities/organization.entity");
const user_entity_1 = require("../../entities/user.entity");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const tenant_guard_1 = require("../../common/guards/tenant.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const user_role_enum_1 = require("../../common/enums/user-role.enum");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const report_history_filter_dto_1 = require("./dto/report-history-filter.dto");
const generate_report_dto_1 = require("./dto/generate-report.dto");
const schedule_report_dto_1 = require("./dto/schedule-report.dto");
let ReportsController = class ReportsController {
    constructor(reportsService, reportGeneratorService, emailService, organizationsRepository, usersRepository) {
        this.reportsService = reportsService;
        this.reportGeneratorService = reportGeneratorService;
        this.emailService = emailService;
        this.organizationsRepository = organizationsRepository;
        this.usersRepository = usersRepository;
    }
    async history(user, filters) {
        return this.reportsService.listHistory(user?.organizationId, filters);
    }
    async getFilterOptions(user) {
        return this.reportsService.getFilterOptions(user?.organizationId);
    }
    async generate(user, dto) {
        return this.reportsService.generate(user?.organizationId, user?.userId, dto);
    }
    async download(id, format = 'pdf', user, res) {
        const report = await this.reportsService.findById(id, user?.organizationId);
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }
        const reportData = await this.reportsService.generate(user?.organizationId, user?.userId, {
            type: report.type,
            filters: report.filters || {},
        });
        const organization = await this.organizationsRepository.findOne({
            where: { id: user?.organizationId },
        });
        const generatedByUser = await this.usersRepository.findOne({
            where: { id: user?.userId },
        });
        let buffer;
        let contentType;
        let filename;
        const reportName = `${report.type}_${new Date().toISOString().split('T')[0]}`;
        const reportPeriod = report.filters
            ? {
                startDate: report.filters.startDate,
                endDate: report.filters.endDate,
            }
            : undefined;
        const metadata = {
            organizationName: organization?.name,
            vatNumber: organization?.vatNumber || undefined,
            address: organization?.address || undefined,
            phone: organization?.contactPerson || undefined,
            email: organization?.contactEmail || undefined,
            currency: organization?.currency || 'AED',
            generatedAt: reportData.generatedAt,
            generatedBy: user?.userId,
            generatedByName: generatedByUser?.name || 'System',
            organizationId: organization?.id,
            filters: report.filters || {},
            reportPeriod,
            summary: reportData.summary,
        };
        switch (format) {
            case 'pdf':
                buffer = await this.reportGeneratorService.generatePDF({
                    type: report.type,
                    data: reportData.data,
                    metadata,
                });
                contentType = 'application/pdf';
                filename = `${reportName}.pdf`;
                break;
            case 'xlsx':
                buffer = await this.reportGeneratorService.generateXLSX({
                    type: report.type,
                    data: reportData.data,
                    metadata,
                });
                contentType =
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                filename = `${reportName}.xlsx`;
                break;
            case 'csv':
                buffer = await this.reportGeneratorService.generateCSV({
                    type: report.type,
                    data: reportData.data,
                    metadata,
                });
                contentType = 'text/csv';
                filename = `${reportName}.csv`;
                break;
            default:
                return res.status(400).json({ message: 'Invalid format' });
        }
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    }
    async schedule(user, dto) {
        const reportData = await this.reportsService.generate(user?.organizationId, user?.userId, {
            type: dto.type,
            filters: dto.filters || {},
        });
        const organization = await this.organizationsRepository.findOne({
            where: { id: user?.organizationId },
        });
        const generatedByUser = await this.usersRepository.findOne({
            where: { id: user?.userId },
        });
        const reportPeriod = dto.filters
            ? {
                startDate: dto.filters.startDate,
                endDate: dto.filters.endDate,
            }
            : undefined;
        if (dto.recipientEmail && dto.format) {
            const format = dto.format || 'pdf';
            const reportName = `${dto.type}_${new Date().toISOString().split('T')[0]}`;
            const metadata = {
                organizationName: organization?.name,
                vatNumber: organization?.vatNumber || undefined,
                address: organization?.address || undefined,
                phone: organization?.contactPerson || undefined,
                email: organization?.contactEmail || undefined,
                currency: organization?.currency || 'AED',
                generatedAt: reportData.generatedAt,
                generatedBy: user?.userId,
                generatedByName: generatedByUser?.name || 'System',
                organizationId: organization?.id,
                filters: dto.filters || {},
                reportPeriod,
                summary: reportData.summary,
            };
            let buffer;
            switch (format) {
                case 'pdf':
                    buffer = await this.reportGeneratorService.generatePDF({
                        type: dto.type,
                        data: reportData.data,
                        metadata,
                    });
                    break;
                case 'xlsx':
                    buffer = await this.reportGeneratorService.generateXLSX({
                        type: dto.type,
                        data: reportData.data,
                        metadata,
                    });
                    break;
                case 'csv':
                    buffer = await this.reportGeneratorService.generateCSV({
                        type: dto.type,
                        data: reportData.data,
                        metadata,
                    });
                    break;
                default:
                    buffer = Buffer.alloc(0);
            }
            await this.emailService.sendReportEmail(dto.recipientEmail, reportName, buffer, format);
        }
        return {
            success: true,
            message: 'Report scheduled and sent',
            report: reportData,
        };
    }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, common_1.Get)('history'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, report_history_filter_dto_1.ReportHistoryFilterDto]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "history", null);
__decorate([
    (0, common_1.Get)('filter-options'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getFilterOptions", null);
__decorate([
    (0, common_1.Post)('generate'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, generate_report_dto_1.GenerateReportDto]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "generate", null);
__decorate([
    (0, common_1.Get)(':id/download'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('format')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "download", null);
__decorate([
    (0, common_1.Post)('schedule'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, schedule_report_dto_1.ScheduleReportDto]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "schedule", null);
exports.ReportsController = ReportsController = __decorate([
    (0, common_1.Controller)('reports'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, tenant_guard_1.TenantGuard),
    __param(3, (0, typeorm_1.InjectRepository)(organization_entity_1.Organization)),
    __param(4, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [reports_service_1.ReportsService,
        report_generator_service_1.ReportGeneratorService,
        email_service_1.EmailService,
        typeorm_2.Repository,
        typeorm_2.Repository])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map