import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds credit_note_line_items table for product name, rate and line-level amounts on credit notes (like tax invoice).
 */
export class AddCreditNoteLineItems1739750000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "credit_note_line_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "is_deleted" boolean NOT NULL DEFAULT false,
        "credit_note_id" uuid,
        "organization_id" uuid,
        "item_name" varchar(255) NOT NULL,
        "quantity" decimal(10,3) NOT NULL DEFAULT 1,
        "unit_price" decimal(12,2) NOT NULL,
        "vat_rate" decimal(5,2) NOT NULL DEFAULT 5.0,
        "amount" decimal(12,2) NOT NULL,
        "vat_amount" decimal(12,2) NOT NULL DEFAULT 0,
        "line_number" int NOT NULL DEFAULT 1,
        CONSTRAINT "PK_credit_note_line_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_credit_note_line_items_credit_note" FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_credit_note_line_items_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_credit_note_line_items_credit_note" ON "credit_note_line_items" ("credit_note_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_credit_note_line_items_org_credit_note" ON "credit_note_line_items" ("organization_id", "credit_note_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "credit_note_line_items"`);
  }
}
