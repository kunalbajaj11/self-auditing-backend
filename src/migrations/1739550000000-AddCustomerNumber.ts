import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds customer_number to customers (e.g. C2026021301) for display on invoices/PDFs.
 */
export class AddCustomerNumber1739550000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD COLUMN IF NOT EXISTS "customer_number" varchar(20)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customers_org_customer_number"
      ON "customers" ("organization_id", "customer_number")
      WHERE "customer_number" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_customers_org_customer_number"
    `);
    await queryRunner.query(`
      ALTER TABLE "customers"
      DROP COLUMN IF EXISTS "customer_number"
    `);
  }
}
