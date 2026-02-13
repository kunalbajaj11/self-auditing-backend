import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds customer_address and customer_phone to sales_invoices for the "Billed to" section.
 */
export class AddSalesInvoiceCustomerAddressPhone1739450000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_invoices"
      ADD COLUMN IF NOT EXISTS "customer_address" text
    `);
    await queryRunner.query(`
      ALTER TABLE "sales_invoices"
      ADD COLUMN IF NOT EXISTS "customer_phone" varchar(50)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_invoices"
      DROP COLUMN IF EXISTS "customer_address"
    `);
    await queryRunner.query(`
      ALTER TABLE "sales_invoices"
      DROP COLUMN IF EXISTS "customer_phone"
    `);
  }
}
