import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { CreditNote } from './credit-note.entity';
import { Organization } from './organization.entity';

@Entity({ name: 'credit_note_line_items' })
@Index(['creditNote'])
@Index(['organization', 'creditNote'])
export class CreditNoteLineItem extends AbstractEntity {
  @ManyToOne(() => CreditNote, (creditNote) => creditNote.lineItems, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'credit_note_id' })
  creditNote: CreditNote | null;

  @ManyToOne(() => Organization, {
    nullable: true,
  })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ name: 'item_name', length: 255 })
  itemName: string;

  @Column({ type: 'decimal', precision: 10, scale: 3, default: 1 })
  quantity: string;

  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2 })
  unitPrice: string;

  @Column({
    name: 'vat_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 5.0,
  })
  vatRate: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @Column({
    name: 'vat_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  vatAmount: string;

  @Column({ name: 'line_number', type: 'int', default: 1 })
  lineNumber: number;
}
