import { registerAs } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';

export default registerAs(
  'database',
  (): DataSourceOptions => ({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'smart_expense_uae',
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    migrationsRun: process.env.DB_RUN_MIGRATIONS === 'true',
    logging: process.env.DB_LOGGING === 'true',
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    ssl:
      process.env.DB_SSL === 'true'
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
    extra: {
      // Connection pool configuration
      max: parseInt(process.env.DB_POOL_MAX ?? '20', 10), // Maximum number of connections in the pool
      min: parseInt(process.env.DB_POOL_MIN ?? '5', 10), // Minimum number of connections in the pool
      idleTimeoutMillis: parseInt(
        process.env.DB_POOL_IDLE_TIMEOUT ?? '30000',
        10,
      ), // Close idle connections after 30 seconds
      connectionTimeoutMillis: parseInt(
        process.env.DB_POOL_CONNECTION_TIMEOUT ?? '10000',
        10,
      ), // Connection timeout
    },
  }),
);
