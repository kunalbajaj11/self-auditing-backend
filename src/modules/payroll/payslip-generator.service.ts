import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { PayrollEntry } from './entities/payroll-entry.entity';
import { PayrollRun } from './entities/payroll-run.entity';
import { Organization } from '../../entities/organization.entity';

@Injectable()
export class PayslipGeneratorService {
  async generatePayslipPDF(
    payrollEntry: PayrollEntry,
    payrollRun: PayrollRun,
    organization: Organization,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Header
        doc
          .fontSize(20)
          .text(organization.name || 'Organization', { align: 'center' });
        doc.moveDown();
        doc.fontSize(16).text('PAYSLIP', { align: 'center' });
        doc.moveDown(2);

        // Employee Information
        const employeeName =
          payrollEntry.user?.name || payrollEntry.user?.email || 'Employee';
        doc.fontSize(12).text(`Employee: ${employeeName}`);
        doc.text(`Pay Period: ${payrollRun.payrollPeriod}`);
        doc.text(`Pay Date: ${payrollRun.payDate}`);
        doc.text(`Payslip #: ${payrollEntry.id.substring(0, 8).toUpperCase()}`);
        doc.moveDown();

        // Salary Breakdown
        doc.fontSize(14).text('EARNINGS', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(11);

        // Basic Salary
        doc.text('Basic Salary', { continued: true });
        doc.text(
          `${payrollRun.currency} ${parseFloat(payrollEntry.basicSalary).toFixed(2)}`,
          { align: 'right' },
        );

        // Allowances
        if (parseFloat(payrollEntry.allowancesAmount) > 0) {
          doc.text('Allowances', { continued: true });
          doc.text(
            `${payrollRun.currency} ${parseFloat(payrollEntry.allowancesAmount).toFixed(2)}`,
            { align: 'right' },
          );
        }

        // Overtime
        if (parseFloat(payrollEntry.overtimeAmount) > 0) {
          doc.text('Overtime', { continued: true });
          doc.text(
            `${payrollRun.currency} ${parseFloat(payrollEntry.overtimeAmount).toFixed(2)}`,
            { align: 'right' },
          );
        }

        // Bonus
        if (parseFloat(payrollEntry.bonusAmount) > 0) {
          doc.text('Bonus', { continued: true });
          doc.text(
            `${payrollRun.currency} ${parseFloat(payrollEntry.bonusAmount).toFixed(2)}`,
            { align: 'right' },
          );
        }

        // Commission
        if (parseFloat(payrollEntry.commissionAmount) > 0) {
          doc.text('Commission', { continued: true });
          doc.text(
            `${payrollRun.currency} ${parseFloat(payrollEntry.commissionAmount).toFixed(2)}`,
            { align: 'right' },
          );
        }

        doc.moveDown();
        doc.text('Gross Salary', { continued: true });
        doc.fontSize(12).font('Helvetica-Bold');
        doc.text(
          `${payrollRun.currency} ${parseFloat(payrollEntry.grossSalary).toFixed(2)}`,
          { align: 'right' },
        );
        doc.font('Helvetica').fontSize(11);
        doc.moveDown();

        // Deductions
        if (parseFloat(payrollEntry.deductionsAmount) > 0) {
          doc.fontSize(14).text('DEDUCTIONS', { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(11);
          doc.text('Deductions', { continued: true });
          doc.text(
            `${payrollRun.currency} ${parseFloat(payrollEntry.deductionsAmount).toFixed(2)}`,
            { align: 'right' },
          );
          doc.moveDown();
        }

        // Net Salary
        doc.moveDown();
        doc.fontSize(14).font('Helvetica-Bold');
        doc.text('NET SALARY', { continued: true });
        doc.text(
          `${payrollRun.currency} ${parseFloat(payrollEntry.netSalary).toFixed(2)}`,
          { align: 'right' },
        );
        doc.font('Helvetica').fontSize(11);

        // Footer
        doc.moveDown(3);
        doc.fontSize(9).text('This is a computer-generated payslip.', {
          align: 'center',
        });
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, {
          align: 'center',
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
