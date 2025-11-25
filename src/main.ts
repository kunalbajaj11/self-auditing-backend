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
  app.enableCors({
    origin: [
      'http://self-auditing-frontend.s3-website.ap-south-1.amazonaws.com',
      'https://self-auditing-frontend.s3-website.ap-south-1.amazonaws.com',
      // Dynamically allow additional CORS origins from environment variable, if set
      ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : []),
      // Allow any subdomain of amazonaws.com using RegExp
      /amazonaws\.com$/,
    ],
    credentials: true,
  });
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
