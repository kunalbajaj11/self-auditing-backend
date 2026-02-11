import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds display_options JSONB to sales_invoices for per-invoice
 * template/display overrides (header, footer, show company/bank/VAT details, etc.).
 */
export class AddSalesInvoiceDisplayOptions1739250000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_invoices"
      ADD COLUMN IF NOT EXISTS "display_options" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_invoices"
      DROP COLUMN IF EXISTS "display_options"
    `);
  }
}
