import { Injectable, Logger } from '@nestjs/common';
import { TaxForm, TaxFormType } from '../../entities/tax-form.entity';
import { VATReturnData } from './tax-forms.service';
import { Organization } from '../../entities/organization.entity';
import { Region } from '../../common/enums/region.enum';

export interface FormGenerationOptions {
  format: 'pdf' | 'excel' | 'csv';
  includeLogo?: boolean;
  includeDetails?: boolean;
}

@Injectable()
export class TaxFormGeneratorService {
  private readonly logger = new Logger(TaxFormGeneratorService.name);

  /**
   * Generate VAT return form
   */
  async generateVATReturn(
    formType: TaxFormType,
    data: VATReturnData,
    organization: Organization,
    options: FormGenerationOptions,
  ): Promise<Buffer> {
    this.logger.log(
      `Generating VAT return: formType=${formType}, period=${data.period}, format=${options.format}`,
    );

    switch (options.format) {
      case 'pdf':
        return this.generateVATReturnPDF(formType, data, organization);
      case 'excel':
        return this.generateVATReturnExcel(formType, data, organization);
      case 'csv':
        return this.generateVATReturnCSV(formType, data, organization);
      default:
        throw new Error(`Unsupported format: ${options.format}`);
    }
  }

  /**
   * Generate VAT return as PDF
   */
  private async generateVATReturnPDF(
    formType: TaxFormType,
    data: VATReturnData,
    organization: Organization,
  ): Promise<Buffer> {
    // For now, generate a simple text-based PDF
    // In production, use a library like pdfkit or puppeteer
    const pdfContent = this.buildVATReturnPDFContent(
      formType,
      data,
      organization,
    );

    // This is a placeholder - in production, use actual PDF generation library
    // For now, return a buffer with text content
    return Buffer.from(pdfContent, 'utf-8');
  }

  /**
   * Generate VAT return as Excel
   */
  private async generateVATReturnExcel(
    formType: TaxFormType,
    data: VATReturnData,
    organization: Organization,
  ): Promise<Buffer> {
    // For now, generate CSV format (can be opened in Excel)
    // In production, use a library like exceljs
    const csvContent = this.buildVATReturnCSVContent(
      formType,
      data,
      organization,
    );
    return Buffer.from(csvContent, 'utf-8');
  }

  /**
   * Generate VAT return as CSV
   */
  private async generateVATReturnCSV(
    formType: TaxFormType,
    data: VATReturnData,
    organization: Organization,
  ): Promise<Buffer> {
    const csvContent = this.buildVATReturnCSVContent(
      formType,
      data,
      organization,
    );
    return Buffer.from(csvContent, 'utf-8');
  }

  /**
   * Build PDF content (placeholder - should use proper PDF library)
   */
  private buildVATReturnPDFContent(
    formType: TaxFormType,
    data: VATReturnData,
    organization: Organization,
  ): string {
    const region = organization.region as Region;
    const formTitle = this.getFormTitle(formType, region);

    let content = `\n`;
    content += `========================================\n`;
    content += `${formTitle}\n`;
    content += `========================================\n\n`;
    content += `Organization: ${data.organization.name}\n`;
    if (data.organization.vatNumber) {
      content += `VAT Number: ${data.organization.vatNumber}\n`;
    }
    content += `Period: ${data.period}\n`;
    content += `Generated: ${new Date().toISOString()}\n\n`;

    content += `SALES (OUTPUT VAT)\n`;
    content += `------------------\n`;
    content += `Standard Rate:\n`;
    content += `  Amount: ${data.sales.standardRate.amount.toFixed(2)} ${organization.currency}\n`;
    content += `  VAT: ${data.sales.standardRate.vatAmount.toFixed(2)} ${organization.currency}\n`;
    content += `  Count: ${data.sales.standardRate.count}\n\n`;
    content += `Zero Rate:\n`;
    content += `  Amount: ${data.sales.zeroRate.amount.toFixed(2)} ${organization.currency}\n`;
    content += `  VAT: ${data.sales.zeroRate.vatAmount.toFixed(2)} ${organization.currency}\n`;
    content += `  Count: ${data.sales.zeroRate.count}\n\n`;
    content += `Exempt:\n`;
    content += `  Amount: ${data.sales.exempt.amount.toFixed(2)} ${organization.currency}\n`;
    content += `  Count: ${data.sales.exempt.count}\n\n`;
    content += `Reverse Charge:\n`;
    content += `  Amount: ${data.sales.reverseCharge.amount.toFixed(2)} ${organization.currency}\n`;
    content += `  VAT: ${data.sales.reverseCharge.vatAmount.toFixed(2)} ${organization.currency}\n`;
    content += `  Count: ${data.sales.reverseCharge.count}\n\n`;

    content += `PURCHASES (INPUT VAT)\n`;
    content += `---------------------\n`;
    content += `Standard Rate:\n`;
    content += `  Amount: ${data.purchases.standardRate.amount.toFixed(2)} ${organization.currency}\n`;
    content += `  VAT: ${data.purchases.standardRate.vatAmount.toFixed(2)} ${organization.currency}\n`;
    content += `  Count: ${data.purchases.standardRate.count}\n\n`;
    content += `Zero Rate:\n`;
    content += `  Amount: ${data.purchases.zeroRate.amount.toFixed(2)} ${organization.currency}\n`;
    content += `  VAT: ${data.purchases.zeroRate.vatAmount.toFixed(2)} ${organization.currency}\n`;
    content += `  Count: ${data.purchases.zeroRate.count}\n\n`;
    content += `Exempt:\n`;
    content += `  Amount: ${data.purchases.exempt.amount.toFixed(2)} ${organization.currency}\n`;
    content += `  Count: ${data.purchases.exempt.count}\n\n`;
    content += `Reverse Charge:\n`;
    content += `  Amount: ${data.purchases.reverseCharge.amount.toFixed(2)} ${organization.currency}\n`;
    content += `  VAT: ${data.purchases.reverseCharge.vatAmount.toFixed(2)} ${organization.currency}\n`;
    content += `  Count: ${data.purchases.reverseCharge.count}\n\n`;

    content += `TOTALS\n`;
    content += `------\n`;
    content += `Total Output VAT: ${data.totals.totalOutputVAT.toFixed(2)} ${organization.currency}\n`;
    content += `Total Input VAT: ${data.totals.totalInputVAT.toFixed(2)} ${organization.currency}\n`;
    content += `Net VAT Payable: ${data.totals.netVATPayable.toFixed(2)} ${organization.currency}\n`;
    if (data.totals.refundable > 0) {
      content += `Refundable: ${data.totals.refundable.toFixed(2)} ${organization.currency}\n`;
    }

    return content;
  }

  /**
   * Build CSV content
   */
  private buildVATReturnCSVContent(
    formType: TaxFormType,
    data: VATReturnData,
    organization: Organization,
  ): string {
    const region = organization.region as Region;
    const formTitle = this.getFormTitle(formType, region);

    let csv = `"${formTitle}"\n`;
    csv += `"Organization","${data.organization.name}"\n`;
    if (data.organization.vatNumber) {
      csv += `"VAT Number","${data.organization.vatNumber}"\n`;
    }
    csv += `"Period","${data.period}"\n`;
    csv += `"Generated","${new Date().toISOString()}"\n\n`;

    csv += `"SALES (OUTPUT VAT)"\n`;
    csv += `"Category","Amount","VAT Amount","Count"\n`;
    csv += `"Standard Rate","${data.sales.standardRate.amount.toFixed(2)}","${data.sales.standardRate.vatAmount.toFixed(2)}","${data.sales.standardRate.count}"\n`;
    csv += `"Zero Rate","${data.sales.zeroRate.amount.toFixed(2)}","${data.sales.zeroRate.vatAmount.toFixed(2)}","${data.sales.zeroRate.count}"\n`;
    csv += `"Exempt","${data.sales.exempt.amount.toFixed(2)}","0.00","${data.sales.exempt.count}"\n`;
    csv += `"Reverse Charge","${data.sales.reverseCharge.amount.toFixed(2)}","${data.sales.reverseCharge.vatAmount.toFixed(2)}","${data.sales.reverseCharge.count}"\n\n`;

    csv += `"PURCHASES (INPUT VAT)"\n`;
    csv += `"Category","Amount","VAT Amount","Count"\n`;
    csv += `"Standard Rate","${data.purchases.standardRate.amount.toFixed(2)}","${data.purchases.standardRate.vatAmount.toFixed(2)}","${data.purchases.standardRate.count}"\n`;
    csv += `"Zero Rate","${data.purchases.zeroRate.amount.toFixed(2)}","${data.purchases.zeroRate.vatAmount.toFixed(2)}","${data.purchases.zeroRate.count}"\n`;
    csv += `"Exempt","${data.purchases.exempt.amount.toFixed(2)}","0.00","${data.purchases.exempt.count}"\n`;
    csv += `"Reverse Charge","${data.purchases.reverseCharge.amount.toFixed(2)}","${data.purchases.reverseCharge.vatAmount.toFixed(2)}","${data.purchases.reverseCharge.count}"\n\n`;

    csv += `"TOTALS"\n`;
    csv += `"Total Output VAT","${data.totals.totalOutputVAT.toFixed(2)}"\n`;
    csv += `"Total Input VAT","${data.totals.totalInputVAT.toFixed(2)}"\n`;
    csv += `"Net VAT Payable","${data.totals.netVATPayable.toFixed(2)}"\n`;
    if (data.totals.refundable > 0) {
      csv += `"Refundable","${data.totals.refundable.toFixed(2)}"\n`;
    }

    return csv;
  }

  /**
   * Get form title based on type and region
   */
  private getFormTitle(formType: TaxFormType, region: Region): string {
    const titles: Record<TaxFormType, string> = {
      [TaxFormType.VAT_RETURN_UAE]: 'UAE VAT Return (Form VAT 201)',
      [TaxFormType.VAT_RETURN_SAUDI]: 'Saudi Arabia VAT Return (Form VAT 100)',
      [TaxFormType.VAT_RETURN_OMAN]: 'Oman VAT Return',
      [TaxFormType.VAT_RETURN_KUWAIT]: 'Kuwait VAT Return',
      [TaxFormType.VAT_RETURN_BAHRAIN]: 'Bahrain VAT Return',
      [TaxFormType.VAT_RETURN_QATAR]: 'Qatar VAT Return',
      [TaxFormType.TDS_RETURN_26Q]: 'India TDS Return (Form 26Q)',
      [TaxFormType.TDS_RETURN_27Q]: 'India TDS Return (Form 27Q)',
      [TaxFormType.TDS_RETURN_24Q]: 'India TDS Return (Form 24Q)',
      [TaxFormType.EPF_CHALLAN]: 'India EPF Challan',
      [TaxFormType.ESI_CHALLAN]: 'India ESI Challan',
      [TaxFormType.GSTR_1]: 'India GSTR-1 (Outward Supplies)',
      [TaxFormType.GSTR_3B]: 'India GSTR-3B (Monthly Return)',
    };

    return titles[formType] || 'Tax Return Form';
  }
}
