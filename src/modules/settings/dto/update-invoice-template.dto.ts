import { IsOptional, IsString, IsBoolean, IsIn } from 'class-validator';

export class UpdateInvoiceTemplateDto {
  @IsOptional()
  @IsString()
  invoiceLogoUrl?: string;

  @IsOptional()
  @IsString()
  invoiceSignatureUrl?: string;

  @IsOptional()
  @IsString()
  invoiceHeaderText?: string;

  @IsOptional()
  @IsString()
  @IsIn(['blue', 'green', 'purple', 'orange', 'red', 'custom'])
  invoiceColorScheme?: string;

  @IsOptional()
  @IsString()
  invoiceCustomColor?: string;

  @IsOptional()
  @IsString()
  invoiceTitle?: string;

  @IsOptional()
  @IsBoolean()
  invoiceShowCompanyDetails?: boolean;

  @IsOptional()
  @IsBoolean()
  invoiceShowVatDetails?: boolean;

  @IsOptional()
  @IsBoolean()
  invoiceShowPaymentTerms?: boolean;

  @IsOptional()
  @IsBoolean()
  invoiceShowPaymentMethods?: boolean;

  @IsOptional()
  @IsBoolean()
  invoiceShowBankDetails?: boolean;

  @IsOptional()
  @IsBoolean()
  invoiceShowTermsConditions?: boolean;

  @IsOptional()
  @IsString()
  invoiceDefaultPaymentTerms?: string;

  @IsOptional()
  @IsString()
  invoiceCustomPaymentTerms?: string;

  @IsOptional()
  @IsString()
  invoiceDefaultNotes?: string;

  @IsOptional()
  @IsString()
  invoiceTermsConditions?: string;

  @IsOptional()
  @IsString()
  invoiceFooterText?: string;

  @IsOptional()
  @IsBoolean()
  invoiceShowFooter?: boolean;

  @IsOptional()
  @IsBoolean()
  invoiceShowItemDescription?: boolean;

  @IsOptional()
  @IsBoolean()
  invoiceShowItemQuantity?: boolean;

  @IsOptional()
  @IsBoolean()
  invoiceShowItemUnitPrice?: boolean;

  @IsOptional()
  @IsBoolean()
  invoiceShowItemTotal?: boolean;

  @IsOptional()
  @IsString()
  invoiceEmailSubject?: string;

  @IsOptional()
  @IsString()
  invoiceEmailMessage?: string;
}
