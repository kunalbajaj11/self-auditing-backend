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
      // IMPORTANT: If you are behind PgBouncer in "session" pooling mode, the effective max clients
      // is limited by PgBouncer `pool_size`. Keep this low (often 5) for production with PgBouncer.
      // For local development without PgBouncer, use a higher value (20-50) to handle parallel queries.
      //
      // Reports service generates complex reports with multiple parallel queries (15+ Promise.all calls).
      // Each parallel query batch may need connections, so pool size should accommodate peak usage.
      //
      // Production with PgBouncer: Set DB_POOL_MAX=5 in environment
      // Local development: Use DB_POOL_MAX=20 or higher
      max: parseInt(process.env.DB_POOL_MAX ?? '20', 10), // Max connections per app instance (default: 20 for local)
      min: parseInt(process.env.DB_POOL_MIN ?? '2', 10), // Min connections to keep alive (default: 2 for better reuse)
      idleTimeoutMillis: parseInt(
        process.env.DB_POOL_IDLE_TIMEOUT ?? '30000',
        10,
      ), // Close idle connections after 30 seconds
      connectionTimeoutMillis: parseInt(
        process.env.DB_POOL_CONNECTION_TIMEOUT ?? '10000',
        10,
      ), // Connection timeout (10 seconds)
    },
  }),
);
