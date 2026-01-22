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
      // Local development: Use DB_POOL_MAX=5 (must match PgBouncer pool_size in session mode)
      // IMPORTANT: With PgBouncer in session mode, max clients = pool_size, so set this to 5 or less
      max: parseInt(process.env.DB_POOL_MAX ?? '5', 10), // Max connections per app instance (default: 5 for PgBouncer session mode)
      min: parseInt(process.env.DB_POOL_MIN ?? '1', 10), // Min connections to keep alive (default: 1)
      idleTimeoutMillis: parseInt(
        process.env.DB_POOL_IDLE_TIMEOUT ?? '20000',
        10,
      ), // Close idle connections after 20 seconds (reduced from 30s)
      connectionTimeoutMillis: parseInt(
        process.env.DB_POOL_CONNECTION_TIMEOUT ?? '10000',
        10,
      ), // Connection timeout (10 seconds)
      // Query timeout: automatically cancel queries that take too long
      // This prevents queries from running indefinitely when client navigates away
      statement_timeout: parseInt(process.env.DB_QUERY_TIMEOUT ?? '30000', 10), // Cancel queries after 30 seconds (default: 30000ms = 30s)
      // Allow pool to wait for available connections instead of immediately failing
      // This prevents "Max client connections reached" errors during peak load
      allowExitOnIdle: false, // Keep pool alive even when idle
    },
  }),
);
