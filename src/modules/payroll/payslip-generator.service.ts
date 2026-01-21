import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { PayrollEntry } from './entities/payroll-entry.entity';
import { PayrollRun } from './entities/payroll-run.entity';
import { Organization } from '../../entities/organization.entity';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class PayslipGeneratorService {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Fetch image from URL and return as Buffer
   */
  private async fetchImageAsBuffer(url: string): Promise<Buffer | null> {
    try {
      const urlLower = url.toLowerCase();
      if (urlLower.endsWith('.svg') || urlLower.includes('image/svg+xml')) {
        console.warn(
          `Skipping SVG image from URL: ${url} (PDFKit doesn't support SVG)`,
        );
        return null;
      }

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
      });

      const contentType = response.headers['content-type'] || '';
      if (
        contentType.includes('image/svg+xml') ||
        contentType.includes('image/svg')
      ) {
        console.warn(
          `Skipping SVG image from URL: ${url} (Content-Type: ${contentType})`,
        );
        return null;
      }

      const buffer = Buffer.from(response.data);
      const bufferStart = buffer.slice(0, 100).toString('utf-8').toLowerCase();
      if (bufferStart.includes('<svg') || bufferStart.includes('<?xml')) {
        console.warn(
          `Skipping SVG image from URL: ${url} (detected SVG content)`,
        );
        return null;
      }

      return buffer;
    } catch (error) {
      console.warn(`Failed to fetch image from URL: ${url}`, error);
      return null;
    }
  }

  /**
   * Get application logo path (default logo)
   */
  private getApplicationLogoPath(): string | null {
    const possiblePaths = [
      path.join(process.cwd(), 'assets', 'images', 'app-logo.jpg'),
      path.join(
        __dirname,
        '..',
        '..',
        '..',
        'assets',
        'images',
        'app-logo.jpg',
      ),
      path.join(__dirname, '..', '..', 'assets', 'images', 'app-logo.jpg'),
      path.join(process.cwd(), 'assets', 'images', 'logo.jpeg'),
      path.join(__dirname, '..', '..', '..', 'assets', 'images', 'logo.jpeg'),
      path.join(__dirname, '..', '..', 'assets', 'images', 'logo.jpeg'),
      path.join(process.cwd(), 'assets', 'images', 'logo.jpg'),
      path.join(__dirname, '..', '..', '..', 'assets', 'images', 'logo.jpg'),
      path.join(__dirname, '..', '..', 'assets', 'images', 'logo.jpg'),
      path.join(process.cwd(), 'assets', 'images', 'logo.png'),
      path.join(__dirname, '..', '..', '..', 'assets', 'images', 'logo.png'),
      path.join(__dirname, '..', '..', 'assets', 'images', 'logo.png'),
    ];

    for (const logoPath of possiblePaths) {
      if (fs.existsSync(logoPath)) {
        const ext = path.extname(logoPath).toLowerCase();
        if (ext === '.svg') {
          continue;
        }
        return logoPath;
      }
    }
    return null;
  }

  /**
   * Format currency amount
   */
  private formatCurrency(
    value: number | string,
    currency: string = 'AED',
  ): string {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) {
      return `${currency} 0.00`;
    }
    const formatted = numValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${currency} ${formatted}`;
  }

  /**
   * Format date
   */
  private formatDate(dateString: string | Date): string {
    if (!dateString) return '';
    const date =
      typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  async generatePayslipPDF(
    payrollEntry: PayrollEntry,
    payrollRun: PayrollRun,
    organization: Organization,
  ): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 50;
        const headerBgColor = '#0077c8'; // Brand color
        const headerHeight = 100;

        // ============================================
        // HEADER SECTION - Professional styling
        // ============================================
        // Header background
        doc
          .rect(margin, 30, pageWidth - 2 * margin, headerHeight)
          .fillColor(headerBgColor)
          .fill();

        // Company logo (left side)
        const logoSize = 60;
        const logoX = margin + 10;
        const logoY = 40;

        // Try to get organization logo from settings
        let logoBuffer: Buffer | null = null;
        try {
          logoBuffer = await this.settingsService.getInvoiceLogoBuffer(
            organization.id,
          );
        } catch (error) {
          console.warn('Failed to get organization logo:', error);
        }

        const localLogoPath = this.getApplicationLogoPath();
        let logoLoaded = false;

        try {
          if (logoBuffer) {
            const bufferStart = logoBuffer
              .slice(0, 100)
              .toString('utf-8')
              .toLowerCase();
            if (
              !bufferStart.includes('<svg') &&
              !bufferStart.includes('<?xml')
            ) {
              doc.image(logoBuffer, logoX, logoY, {
                width: logoSize,
                height: logoSize,
                fit: [logoSize, logoSize],
              });
              logoLoaded = true;
            }
          } else if (localLogoPath) {
            doc.image(localLogoPath, logoX, logoY, {
              width: logoSize,
              height: logoSize,
              fit: [logoSize, logoSize],
            });
            logoLoaded = true;
          }
        } catch (error) {
          console.warn('Failed to load logo:', error);
        }

        if (!logoLoaded) {
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#ffffff');
          doc.text('SelfAccounting.AI', logoX, logoY, { width: logoSize });
        }

        // Company name (to the right of the logo)
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#ffffff');
        const orgName = organization.name || 'Organization';
        const leftTextX = logoX + logoSize + 15;
        doc.text(orgName, leftTextX, 40, {
          width: pageWidth / 2 - (leftTextX - margin) - 20,
        });

        // Payslip title (right side)
        const rightX = pageWidth / 2 + 20;
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#ffffff');
        doc.text('PAYSLIP', rightX, 40, {
          width: pageWidth - rightX - margin,
          align: 'right',
        });

        // Payroll period and date (right side)
        doc.fontSize(9).font('Helvetica').fillColor('#e0e0e0');
        let yPos = 60;
        doc.text(`Period: ${payrollRun.payrollPeriod}`, rightX, yPos, {
          width: pageWidth - rightX - margin,
          align: 'right',
        });
        yPos += 12;
        doc.text(
          `Pay Date: ${this.formatDate(payrollRun.payDate)}`,
          rightX,
          yPos,
          {
            width: pageWidth - rightX - margin,
            align: 'right',
          },
        );
        yPos += 12;
        doc.text(
          `Payslip #: ${payrollEntry.id.substring(0, 8).toUpperCase()}`,
          rightX,
          yPos,
          {
            width: pageWidth - rightX - margin,
            align: 'right',
          },
        );

        // Horizontal line below header
        doc
          .moveTo(margin, 30 + headerHeight + 5)
          .lineTo(pageWidth - margin, 30 + headerHeight + 5)
          .strokeColor('#0077c8')
          .lineWidth(2)
          .stroke();

        doc
          .moveTo(margin, 30 + headerHeight + 7)
          .lineTo(pageWidth - margin, 30 + headerHeight + 7)
          .strokeColor('#e0e0e0')
          .lineWidth(0.5)
          .stroke();

        // Reset fill color
        doc.fillColor('#1a1a1a');
        doc.y = 30 + headerHeight + 20;

        // ============================================
        // EMPLOYEE INFORMATION SECTION
        // ============================================
        const employeeName =
          payrollEntry.employeeName ||
          payrollEntry.user?.name ||
          payrollEntry.user?.email ||
          'Employee';
        const employeeEmail =
          payrollEntry.email || payrollEntry.user?.email || 'N/A';

        // Employee info box
        const infoBoxY = doc.y;
        const infoBoxHeight = 60;
        const infoBoxWidth = pageWidth - 2 * margin;

        doc
          .rect(margin, infoBoxY, infoBoxWidth, infoBoxHeight)
          .fillColor('#f8f9fa')
          .fill()
          .strokeColor('#0077c8')
          .lineWidth(1.5)
          .stroke();

        doc.fontSize(12).font('Helvetica-Bold').fillColor('#0077c8');
        doc.text('Employee Information', margin + 10, infoBoxY + 8);

        doc.fontSize(10).font('Helvetica').fillColor('#374151');
        doc.text(`Name: ${employeeName}`, margin + 10, infoBoxY + 25);
        doc.text(`Email: ${employeeEmail}`, margin + 10, infoBoxY + 38);
        doc.text(
          `Currency: ${payrollEntry.currency || payrollRun.currency}`,
          margin + pageWidth / 2 - margin,
          infoBoxY + 25,
        );

        doc.y = infoBoxY + infoBoxHeight + 15;

        // ============================================
        // EARNINGS SECTION
        // ============================================
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#0077c8');
        doc.text('EARNINGS', margin, doc.y);
        doc.moveDown(0.5);

        // Earnings table header
        const earningsStartY = doc.y;
        doc
          .rect(margin, earningsStartY, pageWidth - 2 * margin, 25)
          .fillColor('#0077c8')
          .fill();

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#ffffff');
        doc.text('Description', margin + 10, earningsStartY + 8);
        doc.text('Amount', pageWidth - margin - 120, earningsStartY + 8, {
          width: 110,
          align: 'right',
        });

        doc.y = earningsStartY + 30;
        doc.fontSize(10).font('Helvetica').fillColor('#1a1a1a');

        // Basic Salary
        doc.text('Basic Salary', margin + 10, doc.y);
        doc.text(
          this.formatCurrency(
            parseFloat(payrollEntry.basicSalary),
            payrollEntry.currency || payrollRun.currency,
          ),
          pageWidth - margin - 10,
          doc.y,
          { width: 110, align: 'right' },
        );
        doc.y += 15;

        // Entry details breakdown (if available)
        if (payrollEntry.entryDetails && payrollEntry.entryDetails.length > 0) {
          const earningsDetails = payrollEntry.entryDetails.filter(
            (detail) =>
              detail.componentType === 'allowance' ||
              detail.componentType === 'overtime' ||
              detail.componentType === 'bonus' ||
              detail.componentType === 'commission',
          );

          for (const detail of earningsDetails) {
            const componentName = detail.componentName || 'Component';
            const amount = parseFloat(detail.amount || '0');
            if (amount > 0) {
              doc.text(componentName, margin + 20, doc.y);
              doc.text(
                this.formatCurrency(
                  amount,
                  payrollEntry.currency || payrollRun.currency,
                ),
                pageWidth - margin - 10,
                doc.y,
                { width: 110, align: 'right' },
              );
              doc.y += 15;
            }
          }
        } else {
          // Fallback to summary amounts if details not available
          if (parseFloat(payrollEntry.allowancesAmount) > 0) {
            doc.text('Allowances', margin + 20, doc.y);
            doc.text(
              this.formatCurrency(
                parseFloat(payrollEntry.allowancesAmount),
                payrollEntry.currency || payrollRun.currency,
              ),
              pageWidth - margin - 10,
              doc.y,
              { width: 110, align: 'right' },
            );
            doc.y += 15;
          }

          if (parseFloat(payrollEntry.overtimeAmount) > 0) {
            doc.text('Overtime', margin + 20, doc.y);
            doc.text(
              this.formatCurrency(
                parseFloat(payrollEntry.overtimeAmount),
                payrollEntry.currency || payrollRun.currency,
              ),
              pageWidth - margin - 10,
              doc.y,
              { width: 110, align: 'right' },
            );
            doc.y += 15;
          }

          if (parseFloat(payrollEntry.bonusAmount) > 0) {
            doc.text('Bonus', margin + 20, doc.y);
            doc.text(
              this.formatCurrency(
                parseFloat(payrollEntry.bonusAmount),
                payrollEntry.currency || payrollRun.currency,
              ),
              pageWidth - margin - 10,
              doc.y,
              { width: 110, align: 'right' },
            );
            doc.y += 15;
          }

          if (parseFloat(payrollEntry.commissionAmount) > 0) {
            doc.text('Commission', margin + 20, doc.y);
            doc.text(
              this.formatCurrency(
                parseFloat(payrollEntry.commissionAmount),
                payrollEntry.currency || payrollRun.currency,
              ),
              pageWidth - margin - 10,
              doc.y,
              { width: 110, align: 'right' },
            );
            doc.y += 15;
          }
        }

        // Gross Salary total
        doc.y += 5;
        doc
          .moveTo(margin, doc.y)
          .lineTo(pageWidth - margin, doc.y)
          .strokeColor('#e0e0e0')
          .lineWidth(0.5)
          .stroke();
        doc.y += 8;

        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1a1a');
        doc.text('Gross Salary', margin + 10, doc.y);
        doc.text(
          this.formatCurrency(
            parseFloat(payrollEntry.grossSalary),
            payrollEntry.currency || payrollRun.currency,
          ),
          pageWidth - margin - 10,
          doc.y,
          { width: 110, align: 'right' },
        );
        doc.y += 20;

        // ============================================
        // DEDUCTIONS SECTION
        // ============================================
        if (parseFloat(payrollEntry.deductionsAmount) > 0) {
          doc.fontSize(14).font('Helvetica-Bold').fillColor('#0077c8');
          doc.text('DEDUCTIONS', margin, doc.y);
          doc.moveDown(0.5);

          // Deductions table header
          const deductionsStartY = doc.y;
          doc
            .rect(margin, deductionsStartY, pageWidth - 2 * margin, 25)
            .fillColor('#dc3545')
            .fill();

          doc.fontSize(10).font('Helvetica-Bold').fillColor('#ffffff');
          doc.text('Description', margin + 10, deductionsStartY + 8);
          doc.text('Amount', pageWidth - margin - 120, deductionsStartY + 8, {
            width: 110,
            align: 'right',
          });

          doc.y = deductionsStartY + 30;
          doc.fontSize(10).font('Helvetica').fillColor('#1a1a1a');

          // Deduction details
          if (
            payrollEntry.entryDetails &&
            payrollEntry.entryDetails.length > 0
          ) {
            const deductionDetails = payrollEntry.entryDetails.filter(
              (detail) => detail.componentType === 'deduction',
            );

            for (const detail of deductionDetails) {
              const componentName = detail.componentName || 'Deduction';
              const amount = parseFloat(detail.amount || '0');
              if (amount > 0) {
                doc.text(componentName, margin + 20, doc.y);
                doc.text(
                  this.formatCurrency(
                    amount,
                    payrollEntry.currency || payrollRun.currency,
                  ),
                  pageWidth - margin - 10,
                  doc.y,
                  { width: 110, align: 'right' },
                );
                doc.y += 15;
              }
            }
          } else {
            // Fallback to summary
            doc.text('Total Deductions', margin + 20, doc.y);
            doc.text(
              this.formatCurrency(
                parseFloat(payrollEntry.deductionsAmount),
                payrollEntry.currency || payrollRun.currency,
              ),
              pageWidth - margin - 10,
              doc.y,
              { width: 110, align: 'right' },
            );
            doc.y += 15;
          }

          // Deductions total
          doc.y += 5;
          doc
            .moveTo(margin, doc.y)
            .lineTo(pageWidth - margin, doc.y)
            .strokeColor('#e0e0e0')
            .lineWidth(0.5)
            .stroke();
          doc.y += 8;

          doc.fontSize(11).font('Helvetica-Bold').fillColor('#dc3545');
          doc.text('Total Deductions', margin + 10, doc.y);
          doc.text(
            this.formatCurrency(
              parseFloat(payrollEntry.deductionsAmount),
              payrollEntry.currency || payrollRun.currency,
            ),
            pageWidth - margin - 10,
            doc.y,
            { width: 110, align: 'right' },
          );
          doc.y += 20;
        }

        // ============================================
        // NET SALARY SECTION - Highlighted
        // ============================================
        const netSalaryBoxY = doc.y;
        const netSalaryBoxHeight = 50;
        const netSalaryBoxWidth = pageWidth - 2 * margin;

        doc
          .rect(margin, netSalaryBoxY, netSalaryBoxWidth, netSalaryBoxHeight)
          .fillColor('#0077c8')
          .fill()
          .strokeColor('#005a9a')
          .lineWidth(2)
          .stroke();

        doc.fontSize(16).font('Helvetica-Bold').fillColor('#ffffff');
        doc.text('NET SALARY', margin + 15, netSalaryBoxY + 12);
        doc.text(
          this.formatCurrency(
            parseFloat(payrollEntry.netSalary),
            payrollEntry.currency || payrollRun.currency,
          ),
          pageWidth - margin - 15,
          netSalaryBoxY + 12,
          { width: 200, align: 'right' },
        );

        doc.y = netSalaryBoxY + netSalaryBoxHeight + 20;

        // ============================================
        // FOOTER SECTION
        // ============================================
        const footerY = pageHeight - 50;
        doc
          .moveTo(margin, footerY - 5)
          .lineTo(pageWidth - margin, footerY - 5)
          .strokeColor('#e0e0e0')
          .lineWidth(0.5)
          .stroke();

        doc.fontSize(8).font('Helvetica').fillColor('#666666');
        doc.text(
          'This is a computer-generated payslip, no signature required.',
          margin,
          footerY,
          {
            align: 'left',
          },
        );
        doc.text('Generated by SelfAccounting.AI', margin, footerY + 10, {
          align: 'left',
        });

        const generatedDate = new Date().toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        const dateTextWidth = doc.widthOfString(generatedDate);
        doc.text(generatedDate, pageWidth - margin - dateTextWidth, footerY);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
