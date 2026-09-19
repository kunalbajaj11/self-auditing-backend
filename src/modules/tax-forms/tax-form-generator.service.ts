import { Injectable, Logger } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';
import { TaxForm, TaxFormType } from '../../entities/tax-form.entity';
import { VATReturnData } from './tax-forms.service';
import { Organization } from '../../entities/organization.entity';
import { Region } from '../../common/enums/region.enum';
import { RegionConfigService } from '../region-config/region-config.service';

export interface FormGenerationOptions {
  format: 'pdf' | 'excel' | 'csv';
  includeLogo?: boolean;
  includeDetails?: boolean;
}

@Injectable()
export class TaxFormGeneratorService {
  private readonly logger = new Logger(TaxFormGeneratorService.name);

  constructor(private readonly regionConfigService: RegionConfigService) {}

  private taxRegistrationFieldLabel(organization: Organization): string {
    const rc = this.regionConfigService.getConfig(
      organization.region as Region,
    );
    return `${rc.trnLabel} / ${rc.vatNumberLabel}`;
  }

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
   * Generate VAT return as a real PDF (PDFKit) — not a text buffer wearing a
   * .pdf extension.
   */
  private async generateVATReturnPDF(
    formType: TaxFormType,
    data: VATReturnData,
    organization: Organization,
  ): Promise<Buffer> {
    const region = organization.region as Region;
    const formTitle = this.getFormTitle(formType, region);
    const currency = organization.currency;

    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.font('Helvetica-Bold').fontSize(16).text(formTitle, { align: 'center' });
        doc.moveDown(0.75);
        doc.font('Helvetica').fontSize(10);
        doc.text(`Organization: ${data.organization.name}`);
        if (data.organization.vatNumber) {
          doc.text(
            `${this.taxRegistrationFieldLabel(organization)}: ${data.organization.vatNumber}`,
          );
        }
        doc.text(`Period: ${data.period}`);
        doc.text(`Generated: ${new Date().toISOString()}`);
        doc.moveDown();

        const section = (
          title: string,
          rows: Array<{ label: string; amount: number; vat?: number; count: number }>,
        ) => {
          doc.font('Helvetica-Bold').fontSize(11).text(title);
          doc.moveDown(0.25);
          doc.font('Helvetica').fontSize(9.5);
          rows.forEach((row) => {
            const parts = [
              `${row.label}:`,
              `Amount ${row.amount.toFixed(2)} ${currency}`,
            ];
            if (row.vat !== undefined) {
              parts.push(`VAT ${row.vat.toFixed(2)} ${currency}`);
            }
            parts.push(`Count ${row.count}`);
            doc.text(parts.join('   '));
          });
          doc.moveDown(0.75);
        };

        section('Sales (Output VAT)', [
          { label: 'Standard Rate', amount: data.sales.standardRate.amount, vat: data.sales.standardRate.vatAmount, count: data.sales.standardRate.count },
          { label: 'Zero Rate', amount: data.sales.zeroRate.amount, vat: data.sales.zeroRate.vatAmount, count: data.sales.zeroRate.count },
          { label: 'Exempt', amount: data.sales.exempt.amount, count: data.sales.exempt.count },
          { label: 'Reverse Charge', amount: data.sales.reverseCharge.amount, vat: data.sales.reverseCharge.vatAmount, count: data.sales.reverseCharge.count },
        ]);

        section('Purchases (Input VAT)', [
          { label: 'Standard Rate', amount: data.purchases.standardRate.amount, vat: data.purchases.standardRate.vatAmount, count: data.purchases.standardRate.count },
          { label: 'Zero Rate', amount: data.purchases.zeroRate.amount, vat: data.purchases.zeroRate.vatAmount, count: data.purchases.zeroRate.count },
          { label: 'Exempt', amount: data.purchases.exempt.amount, count: data.purchases.exempt.count },
          { label: 'Reverse Charge', amount: data.purchases.reverseCharge.amount, vat: data.purchases.reverseCharge.vatAmount, count: data.purchases.reverseCharge.count },
        ]);

        doc.font('Helvetica-Bold').fontSize(11).text('Totals');
        doc.moveDown(0.25);
        doc.font('Helvetica').fontSize(9.5);
        doc.text(`Total Output VAT: ${data.totals.totalOutputVAT.toFixed(2)} ${currency}`);
        doc.text(`Total Input VAT: ${data.totals.totalInputVAT.toFixed(2)} ${currency}`);
        doc.text(`Net VAT Payable: ${data.totals.netVATPayable.toFixed(2)} ${currency}`);
        if (data.totals.refundable > 0) {
          doc.text(`Refundable: ${data.totals.refundable.toFixed(2)} ${currency}`);
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Generate VAT return as a real .xlsx workbook (ExcelJS) — not CSV bytes
   * wearing an Excel content type.
   */
  private async generateVATReturnExcel(
    formType: TaxFormType,
    data: VATReturnData,
    organization: Organization,
  ): Promise<Buffer> {
    const region = organization.region as Region;
    const formTitle = this.getFormTitle(formType, region);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('VAT Return');

    sheet.addRow([formTitle]);
    sheet.addRow(['Organization', data.organization.name]);
    if (data.organization.vatNumber) {
      sheet.addRow([
        this.taxRegistrationFieldLabel(organization),
        data.organization.vatNumber,
      ]);
    }
    sheet.addRow(['Period', data.period]);
    sheet.addRow(['Generated', new Date().toISOString()]);
    sheet.addRow([]);

    sheet.addRow(['SALES (OUTPUT VAT)']);
    sheet.addRow(['Category', 'Amount', 'VAT Amount', 'Count']);
    sheet.addRow(['Standard Rate', data.sales.standardRate.amount, data.sales.standardRate.vatAmount, data.sales.standardRate.count]);
    sheet.addRow(['Zero Rate', data.sales.zeroRate.amount, data.sales.zeroRate.vatAmount, data.sales.zeroRate.count]);
    sheet.addRow(['Exempt', data.sales.exempt.amount, 0, data.sales.exempt.count]);
    sheet.addRow(['Reverse Charge', data.sales.reverseCharge.amount, data.sales.reverseCharge.vatAmount, data.sales.reverseCharge.count]);
    sheet.addRow([]);

    sheet.addRow(['PURCHASES (INPUT VAT)']);
    sheet.addRow(['Category', 'Amount', 'VAT Amount', 'Count']);
    sheet.addRow(['Standard Rate', data.purchases.standardRate.amount, data.purchases.standardRate.vatAmount, data.purchases.standardRate.count]);
    sheet.addRow(['Zero Rate', data.purchases.zeroRate.amount, data.purchases.zeroRate.vatAmount, data.purchases.zeroRate.count]);
    sheet.addRow(['Exempt', data.purchases.exempt.amount, 0, data.purchases.exempt.count]);
    sheet.addRow(['Reverse Charge', data.purchases.reverseCharge.amount, data.purchases.reverseCharge.vatAmount, data.purchases.reverseCharge.count]);
    sheet.addRow([]);

    sheet.addRow(['TOTALS']);
    sheet.addRow(['Total Output VAT', data.totals.totalOutputVAT]);
    sheet.addRow(['Total Input VAT', data.totals.totalInputVAT]);
    sheet.addRow(['Net VAT Payable', data.totals.netVATPayable]);
    if (data.totals.refundable > 0) {
      sheet.addRow(['Refundable', data.totals.refundable]);
    }

    sheet.getColumn(1).width = 24;
    sheet.getColumn(2).width = 16;
    sheet.getColumn(3).width = 16;
    sheet.getColumn(4).width = 10;
    sheet.getRow(1).font = { bold: true, size: 13 };

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer as ArrayBuffer);
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
      const label = this.taxRegistrationFieldLabel(organization);
      csv += `"${label}","${data.organization.vatNumber}"\n`;
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
