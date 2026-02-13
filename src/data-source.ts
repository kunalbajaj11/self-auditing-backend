/**
 * Standalone DataSource for TypeORM CLI (e.g. migration:run).
 * Load .env and use the same options as database.config.
 */
import { config } from 'dotenv';
import * as path from 'path';
import { DataSource } from 'typeorm';

config();

const migrationsDir = path.join(__dirname, 'migrations');

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'smart_expense_uae',
  migrations: [path.join(migrationsDir, '*.js')],
  ssl:
    process.env.DB_SSL === 'true'
      ? { rejectUnauthorized: false }
      : undefined,
});
