"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const helmet = require("helmet");
const compression = require("compression");
const express_rate_limit_1 = require("express-rate-limit");
const hpp = require("hpp");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const expressApp = app.getHttpAdapter().getInstance?.();
    if (expressApp?.set) {
        expressApp.set('trust proxy', 1);
    }
    if (expressApp?.disable) {
        expressApp.disable('x-powered-by');
    }
    app.setGlobalPrefix('api');
    app.enableCors({
        origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
        credentials: true,
    });
    app.use(helmet());
    app.use(hpp());
    app.use(compression());
    app.use((0, express_rate_limit_1.default)({
        windowMs: 60 * 1000,
        max: Number(process.env.RATE_LIMIT_MAX ?? 120),
        standardHeaders: true,
        legacyHeaders: false,
        message: 'Too many requests, please try again later.',
    }));
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
    }));
    await app.listen(process.env.PORT || 3000);
}
bootstrap();
//# sourceMappingURL=main.js.map