import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Organization } from './organization.entity';

@Entity({ name: 'organization_settings' })
export class OrganizationSettings extends AbstractEntity {
  @ManyToOne(() => Organization, { nullable: false })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  // Invoice Template Settings
  @Column({ name: 'invoice_logo_url', type: 'text', nullable: true })
  invoiceLogoUrl?: string | null;

  @Column({ name: 'invoice_header_text', type: 'text', nullable: true })
  invoiceHeaderText?: string | null;

  @Column({ name: 'invoice_color_scheme', length: 50, default: 'blue' })
  invoiceColorScheme: string;

  @Column({ name: 'invoice_custom_color', length: 7, nullable: true })
  invoiceCustomColor?: string | null;

  @Column({ name: 'invoice_title', length: 100, default: 'TAX INVOICE' })
  invoiceTitle: string;

  @Column({ name: 'invoice_show_company_details', default: true })
  invoiceShowCompanyDetails: boolean;

  @Column({ name: 'invoice_show_vat_details', default: true })
  invoiceShowVatDetails: boolean;

  @Column({ name: 'invoice_show_payment_terms', default: true })
  invoiceShowPaymentTerms: boolean;

  @Column({ name: 'invoice_show_payment_methods', default: true })
  invoiceShowPaymentMethods: boolean;

  @Column({ name: 'invoice_show_bank_details', default: false })
  invoiceShowBankDetails: boolean;

  @Column({ name: 'invoice_show_terms_conditions', default: true })
  invoiceShowTermsConditions: boolean;

  @Column({
    name: 'invoice_default_payment_terms',
    length: 100,
    default: 'Net 30',
  })
  invoiceDefaultPaymentTerms: string;

  @Column({
    name: 'invoice_custom_payment_terms',
    type: 'text',
    nullable: true,
  })
  invoiceCustomPaymentTerms?: string | null;

  @Column({ name: 'invoice_default_notes', type: 'text', nullable: true })
  invoiceDefaultNotes?: string | null;

  @Column({ name: 'invoice_terms_conditions', type: 'text', nullable: true })
  invoiceTermsConditions?: string | null;

  @Column({ name: 'invoice_footer_text', type: 'text', nullable: true })
  invoiceFooterText?: string | null;

  @Column({ name: 'invoice_show_footer', default: true })
  invoiceShowFooter: boolean;

  @Column({ name: 'invoice_show_item_description', default: true })
  invoiceShowItemDescription: boolean;

  @Column({ name: 'invoice_show_item_quantity', default: true })
  invoiceShowItemQuantity: boolean;

  @Column({ name: 'invoice_show_item_unit_price', default: true })
  invoiceShowItemUnitPrice: boolean;

  @Column({ name: 'invoice_show_item_total', default: true })
  invoiceShowItemTotal: boolean;

  @Column({ name: 'invoice_email_subject', length: 200, nullable: true })
  invoiceEmailSubject?: string | null;

  @Column({ name: 'invoice_email_message', type: 'text', nullable: true })
  invoiceEmailMessage?: string | null;

  // Tax Settings
  @Column({ name: 'tax_registration_number', length: 50, nullable: true })
  taxRegistrationNumber?: string | null;

  @Column({ name: 'tax_registration_date', type: 'date', nullable: true })
  taxRegistrationDate?: string | null;

  @Column({
    name: 'tax_authority',
    length: 100,
    default: 'Federal Tax Authority',
  })
  taxAuthority: string;

  @Column({ name: 'tax_calculation_method', length: 20, default: 'inclusive' })
  taxCalculationMethod: string;

  @Column({
    name: 'tax_default_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 5.0,
  })
  taxDefaultRate: number;

  @Column({ name: 'tax_rounding_method', length: 20, default: 'standard' })
  taxRoundingMethod: string;

  @Column({ name: 'tax_default_code', length: 20, nullable: true })
  taxDefaultCode?: string | null;

  @Column({ name: 'tax_reporting_period', length: 20, default: 'monthly' })
  taxReportingPeriod: string;

  @Column({ name: 'tax_year_end', length: 5, nullable: true })
  taxYearEnd?: string | null;

  @Column({ name: 'tax_enable_reverse_charge', default: false })
  taxEnableReverseCharge: boolean;

  @Column({
    name: 'tax_reverse_charge_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  taxReverseChargeRate?: number | null;

  @Column({ name: 'tax_calculate_on_shipping', default: true })
  taxCalculateOnShipping: boolean;

  @Column({ name: 'tax_calculate_on_discounts', default: false })
  taxCalculateOnDiscounts: boolean;

  @Column({ name: 'tax_show_on_invoices', default: true })
  taxShowOnInvoices: boolean;

  @Column({ name: 'tax_show_breakdown', default: true })
  taxShowBreakdown: boolean;

  // Currency Settings
  @Column({ name: 'currency_exchange_rate_source', length: 20, default: 'api' })
  currencyExchangeRateSource: string;

  @Column({ name: 'currency_auto_update_rates', default: true })
  currencyAutoUpdateRates: boolean;

  @Column({ name: 'currency_update_frequency', length: 20, default: 'daily' })
  currencyUpdateFrequency: string;

  @Column({ name: 'currency_track_fx_gain_loss', default: true })
  currencyTrackFxGainLoss: boolean;

  @Column({
    name: 'currency_fx_gain_loss_account',
    length: 100,
    nullable: true,
  })
  currencyFxGainLossAccount?: string | null;

  @Column({ name: 'currency_display_format', length: 20, default: 'symbol' })
  currencyDisplayFormat: string;

  @Column({ name: 'currency_rounding', type: 'integer', default: 2 })
  currencyRounding: number;

  @Column({ name: 'currency_rounding_method', length: 20, default: 'standard' })
  currencyRoundingMethod: string;

  @Column({ name: 'currency_show_on_invoices', default: true })
  currencyShowOnInvoices: boolean;

  @Column({ name: 'currency_show_exchange_rate', default: false })
  currencyShowExchangeRate: boolean;

  // Numbering Sequences Settings
  @Column({ name: 'numbering_use_sequential', default: true })
  numberingUseSequential: boolean;

  @Column({ name: 'numbering_allow_manual', default: false })
  numberingAllowManual: boolean;

  @Column({ name: 'numbering_warn_duplicates', default: true })
  numberingWarnDuplicates: boolean;
}
