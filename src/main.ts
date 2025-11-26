import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as helmet from 'helmet';
import * as compression from 'compression';
import rateLimit from 'express-rate-limit';
import * as hpp from 'hpp';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const expressApp = app.getHttpAdapter().getInstance?.();
  if (expressApp?.set) {
    expressApp.set('trust proxy', 1);
  }
  if (expressApp?.disable) {
    expressApp.disable('x-powered-by');
  }
  app.setGlobalPrefix('api');
  
  // Configure CORS before other middleware
  const allowedOrigins = [
    'https://self-auditing-frontend.pages.dev',
    'https://self-auditing.com',
    'http://localhost:4200', // Local development
    'http://localhost:3000', // Local development
    // Dynamically allow additional CORS origins from environment variable, if set
    ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : []),
  ];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
    exposedHeaders: ['Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Configure Helmet
  app.use((helmet as unknown as () => any)());
  app.use((hpp as unknown as () => any)());
  app.use((compression as unknown as () => any)());
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: Number(process.env.RATE_LIMIT_MAX ?? 120),
      standardHeaders: true,
      legacyHeaders: false,
      message: 'Too many requests, please try again later.',
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  await app.listen(process.env.PORT || 3000);
}
bootstrap();
