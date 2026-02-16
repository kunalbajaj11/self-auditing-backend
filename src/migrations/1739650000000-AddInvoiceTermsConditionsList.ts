import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds invoice_terms_conditions_list (jsonb array of strings) to organization_settings
 * so T&C can be stored as multiple items and selected per invoice.
 */
export class AddInvoiceTermsConditionsList1739650000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organization_settings"
      ADD COLUMN IF NOT EXISTS "invoice_terms_conditions_list" jsonb DEFAULT '[]'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organization_settings"
      DROP COLUMN IF EXISTS "invoice_terms_conditions_list"
    `);
  }
}
