import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { Region } from '../common/enums/region.enum';

export enum TaxFormType {
  VAT_RETURN_UAE = 'vat_return_uae', // UAE VAT 201
  VAT_RETURN_SAUDI = 'vat_return_saudi', // Saudi VAT 100
  VAT_RETURN_OMAN = 'vat_return_oman',
  VAT_RETURN_KUWAIT = 'vat_return_kuwait',
  VAT_RETURN_BAHRAIN = 'vat_return_bahrain',
  VAT_RETURN_QATAR = 'vat_return_qatar',
  TDS_RETURN_26Q = 'tds_return_26q', // India - TDS on payments other than salary
  TDS_RETURN_27Q = 'tds_return_27q', // India - TDS on salary
  TDS_RETURN_24Q = 'tds_return_24Q', // India - TDS on salary (quarterly)
  EPF_CHALLAN = 'epf_challan', // India
  ESI_CHALLAN = 'esi_challan', // India
  GSTR_1 = 'gstr_1', // India - Outward supplies
  GSTR_3B = 'gstr_3b', // India - Monthly return
}

export enum TaxFormStatus {
  DRAFT = 'draft',
  GENERATED = 'generated',
  VALIDATED = 'validated',
  FILED = 'filed',
  REJECTED = 'rejected',
}

@Entity({ name: 'tax_forms' })
@Index(['organization', 'formType', 'period'])
@Index(['organization', 'status', 'period'])
export class TaxForm extends AbstractEntity {
  @ManyToOne(() => Organization, { nullable: false })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'form_type', type: 'enum', enum: TaxFormType })
  formType: TaxFormType;

  @Column({ type: 'enum', enum: Region, nullable: true })
  region?: Region | null;

  @Column({ length: 20 })
  period: string; // Format: '2024-01' for monthly, '2024-Q1' for quarterly, '2024' for annual

  @Column({ type: 'jsonb', nullable: true })
  formData?: Record<string, any> | null; // Form data structure

  @Column({
    name: 'status',
    type: 'enum',
    enum: TaxFormStatus,
    default: TaxFormStatus.DRAFT,
  })
  status: TaxFormStatus;

  @Column({ name: 'generated_at', type: 'timestamp', nullable: true })
  generatedAt?: Date | null;

  @Column({ name: 'filed_at', type: 'timestamp', nullable: true })
  filedAt?: Date | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'generated_by_id' })
  generatedBy?: User | null;

  @Column({ name: 'generated_by_id', type: 'uuid', nullable: true })
  generatedById?: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'filed_by_id' })
  filedBy?: User | null;

  @Column({ name: 'filed_by_id', type: 'uuid', nullable: true })
  filedById?: string | null;

  @Column({ name: 'file_path', length: 500, nullable: true })
  filePath?: string | null; // Path to generated PDF/Excel file

  @Column({ name: 'file_format', length: 10, nullable: true })
  fileFormat?: string | null; // 'pdf', 'excel', 'csv'

  @Column({ type: 'int', default: 1 })
  version: number; // Version number for form revisions

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  validationErrors?: string[] | null; // List of validation errors

  @Column({ type: 'jsonb', nullable: true })
  validationWarnings?: string[] | null; // List of validation warnings

  @Column({ name: 'filing_reference', length: 200, nullable: true })
  filingReference?: string | null; // Reference number from tax authority

  @Column({ name: 'filing_date', type: 'date', nullable: true })
  filingDate?: Date | null; // Date when filed with tax authority
}
