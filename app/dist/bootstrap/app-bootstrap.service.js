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
var AppBootstrapService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppBootstrapService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const users_service_1 = require("../modules/users/users.service");
const user_role_enum_1 = require("../common/enums/user-role.enum");
let AppBootstrapService = AppBootstrapService_1 = class AppBootstrapService {
    constructor(configService, usersService) {
        this.configService = configService;
        this.usersService = usersService;
        this.logger = new common_1.Logger(AppBootstrapService_1.name);
    }
    async onModuleInit() {
        const email = this.configService.get('SUPER_ADMIN_EMAIL');
        const password = this.configService.get('SUPER_ADMIN_PASSWORD');
        if (!email || !password) {
            this.logger.warn('SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD not set. Skipping super admin bootstrap.');
            return;
        }
        const name = this.configService.get('SUPER_ADMIN_NAME') ??
            'SmartExpense Super Admin';
        const existing = await this.usersService.findByEmail(email);
        if (existing) {
            if (existing.role !== user_role_enum_1.UserRole.SUPERADMIN) {
                this.logger.warn(`User ${email} exists but is a ${existing.role}. No changes applied.`);
            }
            else {
                this.logger.debug(`Super admin ${email} already present.`);
            }
            return;
        }
        await this.usersService.createSuperAdmin({
            name,
            email,
            password,
            role: user_role_enum_1.UserRole.SUPERADMIN,
        });
        this.logger.log(`Super admin ${email} created successfully.`);
    }
};
exports.AppBootstrapService = AppBootstrapService;
exports.AppBootstrapService = AppBootstrapService = AppBootstrapService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        users_service_1.UsersService])
], AppBootstrapService);
//# sourceMappingURL=app-bootstrap.service.js.map