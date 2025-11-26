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
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        return callback(null, true);
      }
      // Normalize origin (remove trailing slash, convert to lowercase for comparison)
      const normalizedOrigin = origin.trim().toLowerCase().replace(/\/$/, '');
      const normalizedAllowedOrigins = allowedOrigins.map((o) => o.trim().toLowerCase().replace(/\/$/, ''));
      
      if (normalizedAllowedOrigins.includes(normalizedOrigin)) {
        callback(null, true);
      } else {
        console.warn(`CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
      'Access-Control-Allow-Origin',
      'Access-Control-Allow-Headers',
      'Access-Control-Allow-Methods',
    ],
    exposedHeaders: ['Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Configure Helmet to not interfere with CORS
  const helmetMiddleware = helmet();
  app.use(helmetMiddleware);
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
