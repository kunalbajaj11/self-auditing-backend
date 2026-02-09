import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds optional invoice_signature_url to organization_settings for
 * authorised signatory signature image (invoice template, preview, PDF).
 */
export class AddInvoiceSignatureUrl1739120500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organization_settings"
      ADD COLUMN IF NOT EXISTS "invoice_signature_url" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organization_settings"
      DROP COLUMN IF EXISTS "invoice_signature_url"
    `);
  }
}
