import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailTemplate } from '../../entities/email-template.entity';
import { NotificationType } from '../../common/enums/notification-type.enum';
import { Organization } from '../../entities/organization.entity';

interface TemplateVariables {
  [key: string]: string | number | null | undefined;
}

@Injectable()
export class EmailTemplateService {
  constructor(
    @InjectRepository(EmailTemplate)
    private readonly emailTemplateRepository: Repository<EmailTemplate>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
  ) {}

  /**
   * Get template for a notification type, preferring organization-specific over default
   */
  async getTemplate(
    organizationId: string,
    notificationType: NotificationType,
  ): Promise<EmailTemplate | null> {
    // Try organization-specific template first
    const orgTemplate = await this.emailTemplateRepository.findOne({
      where: {
        organization: { id: organizationId },
        type: notificationType,
        isActive: true,
      },
    });

    if (orgTemplate) {
      return orgTemplate;
    }

    // Fall back to default template
    const defaultTemplate = await this.emailTemplateRepository.findOne({
      where: {
        type: notificationType,
        isDefault: true,
        isActive: true,
      },
    });

    return defaultTemplate;
  }

  /**
   * Render template with variables
   */
  renderTemplate(
    template: EmailTemplate,
    variables: TemplateVariables,
  ): { subject: string; html: string; text?: string } {
    const subject = template.subject;
    const html = template.htmlBody;
    const text = template.textBody || '';

    // Replace variables in format {{variableName}}
    const replaceVariables = (str: string): string => {
      if (!str) return str;
      return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        const value = variables[key];
        return value !== null && value !== undefined ? String(value) : match;
      });
    };

    return {
      subject: replaceVariables(subject),
      html: replaceVariables(html),
      text: text ? replaceVariables(text) : undefined,
    };
  }

  /**
   * Initialize default templates for an organization
   */
  async initializeDefaultTemplates(organizationId: string): Promise<void> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) return;

    const defaultTemplates = this.getDefaultTemplates();
    for (const template of defaultTemplates) {
      const exists = await this.emailTemplateRepository.findOne({
        where: {
          organization: { id: organizationId },
          type: template.type,
        },
      });

      if (!exists) {
        const emailTemplate = this.emailTemplateRepository.create({
          organization,
          type: template.type,
          subject: template.subject,
          htmlBody: template.htmlBody,
          textBody: template.textBody,
          isDefault: false,
          isActive: true,
        });
        await this.emailTemplateRepository.save(emailTemplate);
      }
    }
  }

  /**
   * Get default template definitions
   */
  private getDefaultTemplates(): Partial<EmailTemplate>[] {
    return [
      {
        type: NotificationType.INVOICE_DUE_SOON,
        subject: 'Invoice #{{invoiceNumber}} Due in 3 Days',
        htmlBody: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #f9f9f9; }
                .invoice-details { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #1976d2; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>SelfAccounting.AI</h1>
                </div>
                <div class="content">
                  <h2>Invoice Due in 3 Days</h2>
                  <div class="invoice-details">
                    <p><strong>Invoice Number:</strong> {{invoiceNumber}}</p>
                    <p><strong>Customer:</strong> {{customerName}}</p>
                    <p><strong>Amount:</strong> {{currency}} {{totalAmount}}</p>
                    <p><strong>Due Date:</strong> {{dueDate}}</p>
                  </div>
                  <p>This invoice is due in 3 days. Please follow up for payment.</p>
                </div>
                <div class="footer">
                  <p>This is an automated notification from SelfAccounting.AI.</p>
                </div>
              </div>
            </body>
          </html>
        `,
        textBody: `Invoice #{{invoiceNumber}} for {{customerName}} (Amount: {{currency}} {{totalAmount}}) is due in 3 days on {{dueDate}}. Please follow up for payment.`,
      },
      {
        type: NotificationType.INVOICE_OVERDUE,
        subject: 'URGENT: Invoice #{{invoiceNumber}} is Overdue',
        htmlBody: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #d32f2f; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #f9f9f9; }
                .invoice-details { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #d32f2f; }
                .urgent { color: #d32f2f; font-weight: bold; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>SelfAccounting.AI</h1>
                </div>
                <div class="content">
                  <h2 class="urgent">Invoice Overdue</h2>
                  <div class="invoice-details">
                    <p><strong>Invoice Number:</strong> {{invoiceNumber}}</p>
                    <p><strong>Customer:</strong> {{customerName}}</p>
                    <p><strong>Amount:</strong> {{currency}} {{totalAmount}}</p>
                    <p><strong>Days Overdue:</strong> <span class="urgent">{{daysOverdue}}</span></p>
                  </div>
                  <p class="urgent">This invoice is overdue. Please take immediate action.</p>
                </div>
                <div class="footer">
                  <p>This is an automated notification from SelfAccounting.AI.</p>
                </div>
              </div>
            </body>
          </html>
        `,
        textBody: `URGENT: Invoice #{{invoiceNumber}} for {{customerName}} (Amount: {{currency}} {{totalAmount}}) is {{daysOverdue}} day(s) overdue. Please take immediate action.`,
      },
      {
        type: NotificationType.EXPENSE_APPROVAL_PENDING,
        subject: '{{expenseCount}} Expense(s) Pending Approval',
        htmlBody: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #f9f9f9; }
                .summary { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #ff9800; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>SelfAccounting.AI</h1>
                </div>
                <div class="content">
                  <h2>Expense Approval Pending</h2>
                  <div class="summary">
                    <p><strong>Number of Expenses:</strong> {{expenseCount}}</p>
                    <p><strong>Total Amount:</strong> {{currency}} {{totalAmount}}</p>
                  </div>
                  <p>You have expense(s) pending approval. Please review and approve them.</p>
                </div>
                <div class="footer">
                  <p>This is an automated notification from SelfAccounting.AI.</p>
                </div>
              </div>
            </body>
          </html>
        `,
        textBody: `You have {{expenseCount}} expense(s) totaling {{currency}} {{totalAmount}} pending approval. Please review and approve them.`,
      },
      {
        type: NotificationType.ACCRUAL_REMINDER,
        subject: 'Accrual Payment Reminder - {{vendorName}}',
        htmlBody: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #f9f9f9; }
                .accrual-details { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #1976d2; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>SelfAccounting.AI</h1>
                </div>
                <div class="content">
                  <h2>Accrual Payment Reminder</h2>
                  <div class="accrual-details">
                    <p><strong>Vendor:</strong> {{vendorName}}</p>
                    <p><strong>Amount:</strong> {{currency}} {{amount}}</p>
                    <p><strong>Due Date:</strong> {{expectedPaymentDate}}</p>
                  </div>
                  <p>This accrual payment is due soon. Please ensure settlement.</p>
                </div>
                <div class="footer">
                  <p>This is an automated notification from SelfAccounting.AI.</p>
                </div>
              </div>
            </body>
          </html>
        `,
        textBody: `Reminder: Payment of {{currency}} {{amount}} for accrual (Vendor: {{vendorName}}) is due on {{expectedPaymentDate}}. Please ensure settlement.`,
      },
    ];
  }
}
