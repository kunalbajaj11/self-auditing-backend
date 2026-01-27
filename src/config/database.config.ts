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
      // IMPORTANT: Connection pool sizing depends on your deployment architecture:
      //
      // 1. WITHOUT PgBouncer (Direct PostgreSQL connection):
      //    - Default: 20 connections per instance (supports ~100 concurrent clients with 3-5 instances)
      //    - For high-traffic: 30-50 connections per instance
      //    - Formula: (expected_concurrent_requests / num_instances) * 1.5
      //
      // 2. WITH PgBouncer in "session" pooling mode:
      //    - Set DB_POOL_MAX=5 (must match PgBouncer pool_size)
      //    - PgBouncer handles connection pooling at the database level
      //    - Each app instance uses 5 connections max
      //
      // 3. WITH PgBouncer in "transaction" pooling mode:
      //    - Can use higher values (20-30) as PgBouncer multiplexes connections
      //    - More efficient for high-concurrency scenarios
      //
      // Reports service generates complex reports with multiple parallel queries (15+ Promise.all calls).
      // Each parallel query batch may need connections, so pool size should accommodate peak usage.
      //
      // For 100 concurrent clients without PgBouncer:
      //   - Recommended: 3-5 app instances with 20 connections each = 60-100 total connections
      //   - This provides headroom for parallel queries and peak load
      max: parseInt(process.env.DB_POOL_MAX ?? '30', 10), // Max connections per app instance (increased from 20 to 30 to handle trial balance parallel queries)
      min: parseInt(process.env.DB_POOL_MIN ?? '2', 10), // Min connections to keep alive (default: 2 to reduce connection churn)
      idleTimeoutMillis: parseInt(
        process.env.DB_POOL_IDLE_TIMEOUT ?? '20000',
        10,
      ), // Close idle connections after 20 seconds
      connectionTimeoutMillis: parseInt(
        process.env.DB_POOL_CONNECTION_TIMEOUT ?? '30000',
        10,
      ), // Connection timeout (increased from 10 to 30 seconds to handle connection pool exhaustion)
      // Query timeout: automatically cancel queries that take too long
      // This prevents queries from running indefinitely when client navigates away
      statement_timeout: parseInt(process.env.DB_QUERY_TIMEOUT ?? '30000', 10), // Cancel queries after 30 seconds (default: 30000ms = 30s)
      // Allow pool to wait for available connections instead of immediately failing
      // This prevents "Max client connections reached" errors during peak load
      allowExitOnIdle: false, // Keep pool alive even when idle
    },
  }),
);
