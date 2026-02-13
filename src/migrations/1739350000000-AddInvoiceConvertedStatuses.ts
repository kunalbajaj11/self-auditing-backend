import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds invoice status enum values for tracking conversions:
 * - quotation_converted_to_proforma
 * - proforma_converted_to_invoice
 *
 * Resolves the actual enum type name from the sales_invoices.status column
 * so it works regardless of TypeORM/naming convention.
 */
export class AddInvoiceConvertedStatuses1739350000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const result = await queryRunner.query(`
      SELECT t.typname
      FROM pg_attribute a
      JOIN pg_type t ON t.oid = a.atttypid
      JOIN pg_class c ON c.oid = a.attrelid
      WHERE c.relname = 'sales_invoices'
        AND a.attname = 'status'
        AND NOT a.attisdropped
        AND a.attnum > 0
      LIMIT 1
    `);

    const rows = Array.isArray(result) ? result : [];
    const typeName = (rows[0] as { typname?: string } | undefined)?.typname ?? 'sales_invoices_status_enum';

    await queryRunner.query(`
      ALTER TYPE "${typeName}"
      ADD VALUE IF NOT EXISTS 'quotation_converted_to_proforma'
    `);
    await queryRunner.query(`
      ALTER TYPE "${typeName}"
      ADD VALUE IF NOT EXISTS 'proforma_converted_to_invoice'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values easily; leave as no-op.
    // To fully revert, you would need to create a new type and migrate data.
  }
}
