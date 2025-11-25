"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SanitizeAttachmentsInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
let SanitizeAttachmentsInterceptor = class SanitizeAttachmentsInterceptor {
    intercept(context, next) {
        return next.handle().pipe((0, operators_1.map)((data) => {
            if (Array.isArray(data)) {
                return data.map((item) => this.sanitizeItem(item));
            }
            return this.sanitizeItem(data);
        }));
    }
    sanitizeItem(item) {
        if (!item || typeof item !== 'object') {
            return item;
        }
        const sanitized = { ...item };
        if (Array.isArray(sanitized.attachments)) {
            sanitized.attachments = sanitized.attachments.map((attachment) => {
                const sanitizedAttachment = { ...attachment };
                if (sanitizedAttachment.fileUrl && sanitizedAttachment.fileKey) {
                    sanitizedAttachment.fileUrl = '[REDACTED - Use fileKey with secure endpoints]';
                }
                return sanitizedAttachment;
            });
        }
        Object.keys(sanitized).forEach((key) => {
            if (sanitized[key] && typeof sanitized[key] === 'object' && !Array.isArray(sanitized[key])) {
                sanitized[key] = this.sanitizeItem(sanitized[key]);
            }
        });
        return sanitized;
    }
};
exports.SanitizeAttachmentsInterceptor = SanitizeAttachmentsInterceptor;
exports.SanitizeAttachmentsInterceptor = SanitizeAttachmentsInterceptor = __decorate([
    (0, common_1.Injectable)()
], SanitizeAttachmentsInterceptor);
//# sourceMappingURL=sanitize-attachments.interceptor.js.map