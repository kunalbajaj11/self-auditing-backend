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
var AttachmentsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttachmentsController = void 0;
const common_1 = require("@nestjs/common");
const common_2 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const tenant_guard_1 = require("../../common/guards/tenant.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const user_role_enum_1 = require("../../common/enums/user-role.enum");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const file_storage_service_1 = require("./file-storage.service");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const attachment_entity_1 = require("../../entities/attachment.entity");
let AttachmentsController = AttachmentsController_1 = class AttachmentsController {
    constructor(fileStorageService, attachmentsRepository) {
        this.fileStorageService = fileStorageService;
        this.attachmentsRepository = attachmentsRepository;
        this.logger = new common_2.Logger(AttachmentsController_1.name);
    }
    async upload(file, user, folder) {
        if (!file) {
            throw new Error('No file provided');
        }
        const result = await this.fileStorageService.uploadFile(file, user?.organizationId, folder || 'expenses');
        return {
            ...result,
            uploadedBy: user?.userId,
            uploadedAt: new Date(),
        };
    }
    async viewFile(attachmentId, user, req, res) {
        this.logger.debug(`viewFile called: attachmentId=${attachmentId}, userId=${user?.userId}, orgId=${user?.organizationId}, role=${user?.role}`);
        const attachment = await this.attachmentsRepository.findOne({
            where: { id: attachmentId, isDeleted: false },
            relations: ['organization', 'expense', 'expense.user'],
        });
        if (!attachment) {
            this.logger.warn(`Attachment not found: ${attachmentId}`);
            throw new common_1.NotFoundException('File not found');
        }
        if (attachment.organization.id !== user?.organizationId) {
            this.logger.warn(`Forbidden: org mismatch. attachment.org=${attachment.organization.id} user.org=${user?.organizationId}`);
            throw new common_1.ForbiddenException('Access denied to this file');
        }
        if (user?.role === user_role_enum_1.UserRole.EMPLOYEE) {
            if (attachment.expense.user.id !== user?.userId) {
                this.logger.warn(`Forbidden: employee tried to access another user's attachment. expense.user=${attachment.expense.user.id} user=${user?.userId}`);
                throw new common_1.ForbiddenException('Access denied to this file');
            }
        }
        if (!attachment.fileKey) {
            this.logger.warn(`Attachment missing fileKey: ${attachmentId}`);
            throw new common_1.NotFoundException('File key not found');
        }
        const acceptsJson = req?.headers?.accept?.includes('application/json') ||
            req?.headers?.['x-requested-with'] === 'XMLHttpRequest';
        const wantsJson = acceptsJson || req?.query?.['json'] === '1';
        if (wantsJson) {
            this.logger.debug(`XHR detected, returning JSON signed URL for view key=${attachment.fileKey}`);
            const signedUrl = await this.fileStorageService.getSignedUrl(attachment.fileKey, 300);
            res?.setHeader?.('Content-Type', 'application/json');
            return { url: signedUrl };
        }
        if (res) {
            try {
                this.logger.debug(`Attempting to stream object inline: key=${attachment.fileKey}`);
                const obj = await this.fileStorageService.getObject(attachment.fileKey);
                if (obj.contentType) {
                    res.setHeader('Content-Type', obj.contentType);
                }
                res.setHeader('Cache-Control', 'private, max-age=300');
                if (obj.body?.pipe) {
                    this.logger.debug(`Streaming started for key=${attachment.fileKey}`);
                    obj.body.pipe(res);
                    return;
                }
            }
            catch (e) {
                this.logger.error(`Streaming failed for key=${attachment.fileKey}. Falling back to signed URL. Error=${e?.message}`);
                const signedUrl = await this.fileStorageService.getSignedUrl(attachment.fileKey, 300);
                res.redirect(signedUrl);
                return;
            }
        }
        this.logger.debug(`Returning signed URL for API usage: key=${attachment.fileKey}`);
        const signedUrl = await this.fileStorageService.getSignedUrl(attachment.fileKey, 300);
        return { url: signedUrl };
    }
    async downloadFile(attachmentId, user, req, res) {
        this.logger.debug(`downloadFile called: attachmentId=${attachmentId}, userId=${user?.userId}, orgId=${user?.organizationId}, role=${user?.role}`);
        const attachment = await this.attachmentsRepository.findOne({
            where: { id: attachmentId, isDeleted: false },
            relations: ['organization', 'expense', 'expense.user'],
        });
        if (!attachment) {
            this.logger.warn(`Attachment not found: ${attachmentId}`);
            throw new common_1.NotFoundException('File not found');
        }
        if (attachment.organization.id !== user?.organizationId) {
            this.logger.warn(`Forbidden: org mismatch. attachment.org=${attachment.organization.id} user.org=${user?.organizationId}`);
            throw new common_1.ForbiddenException('Access denied to this file');
        }
        if (user?.role === user_role_enum_1.UserRole.EMPLOYEE) {
            if (attachment.expense.user.id !== user?.userId) {
                this.logger.warn(`Forbidden: employee tried to download another user's attachment. expense.user=${attachment.expense.user.id} user=${user?.userId}`);
                throw new common_1.ForbiddenException('Access denied to this file');
            }
        }
        if (!attachment.fileKey) {
            this.logger.warn(`Attachment missing fileKey: ${attachmentId}`);
            throw new common_1.NotFoundException('File key not found');
        }
        const acceptsJson = req?.headers?.accept?.includes('application/json') ||
            req?.headers?.['x-requested-with'] === 'XMLHttpRequest';
        const wantsJson = acceptsJson || req?.query?.['json'] === '1';
        if (wantsJson) {
            this.logger.debug(`XHR detected, returning JSON signed URL for download key=${attachment.fileKey}`);
            const signedUrl = await this.fileStorageService.getSignedUrl(attachment.fileKey, 300);
            res?.setHeader?.('Content-Type', 'application/json');
            return { url: signedUrl, fileName: attachment.fileName, fileType: attachment.fileType };
        }
        if (res) {
            try {
                this.logger.debug(`Attempting to stream object as attachment: key=${attachment.fileKey}`);
                const obj = await this.fileStorageService.getObject(attachment.fileKey);
                res.setHeader('Content-Disposition', `attachment; filename="${attachment.fileName}"`);
                res.setHeader('Cache-Control', 'private, max-age=300');
                res.setHeader('Content-Type', attachment.fileType || obj.contentType || 'application/octet-stream');
                if (obj.contentLength) {
                    res.setHeader('Content-Length', obj.contentLength.toString());
                }
                if (obj.body?.pipe) {
                    this.logger.debug(`Streaming download started for key=${attachment.fileKey}`);
                    obj.body.pipe(res);
                    return;
                }
            }
            catch (e) {
                this.logger.error(`Streaming download failed for key=${attachment.fileKey}. Falling back to signed URL. Error=${e?.message}`);
                const signedUrl = await this.fileStorageService.getSignedUrl(attachment.fileKey, 300);
                res.setHeader('Content-Disposition', `attachment; filename="${attachment.fileName}"`);
                res.redirect(signedUrl);
                return;
            }
        }
        this.logger.debug(`Returning signed URL for API usage (download): key=${attachment.fileKey}`);
        const signedUrl = await this.fileStorageService.getSignedUrl(attachment.fileKey, 300);
        return { url: signedUrl, fileName: attachment.fileName, fileType: attachment.fileType };
    }
    async getSignedUrl(fileKey, expiresIn, user) {
        if (!fileKey) {
            throw new Error('File key is required');
        }
        const attachment = await this.attachmentsRepository.findOne({
            where: { fileKey, isDeleted: false },
            relations: ['organization'],
        });
        if (!attachment) {
            throw new common_1.NotFoundException('File not found');
        }
        if (attachment.organization.id !== user?.organizationId) {
            throw new common_1.ForbiddenException('Access denied to this file');
        }
        const url = await this.fileStorageService.getSignedUrl(fileKey, expiresIn ? parseInt(expiresIn, 10) : 3600);
        return { url };
    }
    async delete(fileKey) {
        await this.fileStorageService.deleteFile(fileKey);
        return { success: true };
    }
};
exports.AttachmentsController = AttachmentsController;
__decorate([
    (0, common_1.Post)('upload'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT, user_role_enum_1.UserRole.EMPLOYEE),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('folder')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", Promise)
], AttachmentsController.prototype, "upload", null);
__decorate([
    (0, common_1.Get)('view/:attachmentId'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT, user_role_enum_1.UserRole.EMPLOYEE),
    __param(0, (0, common_1.Param)('attachmentId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AttachmentsController.prototype, "viewFile", null);
__decorate([
    (0, common_1.Get)('download/:attachmentId'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT, user_role_enum_1.UserRole.EMPLOYEE),
    __param(0, (0, common_1.Param)('attachmentId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AttachmentsController.prototype, "downloadFile", null);
__decorate([
    (0, common_1.Get)('signed-url'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT, user_role_enum_1.UserRole.EMPLOYEE),
    __param(0, (0, common_1.Query)('fileKey')),
    __param(1, (0, common_1.Query)('expiresIn')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], AttachmentsController.prototype, "getSignedUrl", null);
__decorate([
    (0, common_1.Delete)(':fileKey'),
    (0, roles_decorator_1.Roles)(user_role_enum_1.UserRole.ADMIN, user_role_enum_1.UserRole.ACCOUNTANT),
    __param(0, (0, common_1.Param)('fileKey')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AttachmentsController.prototype, "delete", null);
exports.AttachmentsController = AttachmentsController = AttachmentsController_1 = __decorate([
    (0, common_1.Controller)('attachments'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, tenant_guard_1.TenantGuard),
    __param(1, (0, typeorm_1.InjectRepository)(attachment_entity_1.Attachment)),
    __metadata("design:paramtypes", [file_storage_service_1.FileStorageService,
        typeorm_2.Repository])
], AttachmentsController);
//# sourceMappingURL=attachments.controller.js.map