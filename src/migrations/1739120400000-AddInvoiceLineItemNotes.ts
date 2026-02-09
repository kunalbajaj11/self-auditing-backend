import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds optional `notes` column to invoice_line_items for per-line notes
 * shown under item name on sales invoices (PDF and preview).
 * Safe to run multiple times (IF NOT EXISTS).
 */
export class AddInvoiceLineItemNotes1739120400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoice_line_items"
      ADD COLUMN IF NOT EXISTS "notes" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoice_line_items"
      DROP COLUMN IF EXISTS "notes"
    `);
  }
}
