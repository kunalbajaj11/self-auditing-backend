import { Injectable, Inject, Optional, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { NotificationType } from '../../common/enums/notification-type.enum';
import { EmailTemplateService } from './email-template.service';
import * as fs from 'fs';
import * as path from 'path';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: Buffer;
    contentType?: string;
  }>;
}

@Injectable()
export class EmailService {
  private resend: Resend | null = null;
  private fromEmail: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => EmailTemplateService))
    @Optional()
    private readonly emailTemplateService?: EmailTemplateService,
  ) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.fromEmail = this.configService.get<string>(
      'EMAIL_FROM',
      'smartexpense.uae@gmail.com',
    );

    if (apiKey) {
      this.resend = new Resend(apiKey);
      console.log('Email service configured with Resend API');
    } else {
      console.warn('RESEND_API_KEY not found. Email service will be disabled.');
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.resend) {
      console.warn('Email service not configured. Skipping email send.');
      return false;
    }

    try {
      const toAddresses = Array.isArray(options.to) ? options.to : [options.to];

      console.log(`Attempting to send email to: ${toAddresses.join(', ')}`);

      // Transform attachments to Resend format
      const attachments = options.attachments?.map((att) => ({
        filename: att.filename,
        content:
          att.content ||
          (att.path ? fs.readFileSync(att.path) : Buffer.alloc(0)),
      }));

      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: toAddresses,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments,
      });

      if (error) {
        console.error('Email send failed:', {
          to: toAddresses.join(', '),
          error: error.message,
          name: error.name,
        });
        return false;
      }

      console.log('Email sent successfully:', data?.id);
      return true;
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';

      console.error('Email send failed:', {
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        error: errorMessage,
      });

      return false;
    }
  }

  async sendNotificationEmail(
    to: string,
    title: string,
    message: string,
    type?: string,
    organizationId?: string,
    templateVariables?: Record<string, any>,
  ): Promise<boolean> {
    // Priority 3: Try to use custom template if available
    if (
      this.emailTemplateService &&
      organizationId &&
      type &&
      Object.values(NotificationType).includes(type as NotificationType) &&
      templateVariables
    ) {
      try {
        const template = await this.emailTemplateService.getTemplate(
          organizationId,
          type as NotificationType,
        );

        if (template) {
          const rendered = this.emailTemplateService.renderTemplate(
            template,
            templateVariables,
          );
          return this.sendEmail({
            to,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
          });
        }
      } catch (error) {
        console.warn(
          'Failed to use email template, falling back to default:',
          error,
        );
      }
    }

    // Fallback to default email format
    const subject = `SmartExpense: ${title}`;
    const html = this.buildNotificationHtml(title, message);

    return this.sendEmail({
      to,
      subject,
      html,
      text: message,
    });
  }

  async sendReportEmail(
    to: string,
    reportName: string,
    reportBuffer: Buffer,
    reportType: 'pdf' | 'xlsx' | 'csv',
  ): Promise<boolean> {
    const extension = reportType;
    const filename = `${reportName}.${extension}`;

    const subject = `SmartExpense Report: ${reportName}`;
    const html = this.buildReportEmailHtml(reportName);

    return this.sendEmail({
      to,
      subject,
      html,
      attachments: [
        {
          filename,
          content: reportBuffer,
        },
      ],
    });
  }

  private buildNotificationHtml(title: string, message: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>SmartExpense UAE</h1>
            </div>
            <div class="content">
              <h2>${title}</h2>
              <p>${message.replace(/\n/g, '<br>')}</p>
            </div>
            <div class="footer">
              <p>This is an automated notification from SmartExpense UAE.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private buildReportEmailHtml(reportName: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>SmartExpense UAE</h1>
            </div>
            <div class="content">
              <h2>Report Ready: ${reportName}</h2>
              <p>Your requested report has been generated and is attached to this email.</p>
            </div>
            <div class="footer">
              <p>This is an automated notification from SmartExpense UAE.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  async sendWelcomeEmail(
    to: string,
    userName: string,
    organizationName?: string,
  ): Promise<boolean> {
    try {
      // Get the path to the user manual PDF
      // The PDF is located in the backend assets directory for production compatibility
      // Try multiple possible paths to handle both development and production
      let pdfPath: string | null = null;

      // Try path from compiled dist directory (production) - assets folder
      const distAssetsPath = path.resolve(
        __dirname,
        '../../../assets',
        'USER-MANUAL.pdf',
      );
      // Try path from source directory (development) - assets folder
      const srcAssetsPath = path.resolve(
        __dirname,
        '../../../assets',
        'USER-MANUAL.pdf',
      );
      // Try path from compiled dist directory (legacy - docs folder at project root)
      const distPath = path.resolve(
        __dirname,
        '../../../../..',
        'docs',
        'USER-MANUAL.pdf',
      );
      // Try path from source directory (legacy - docs folder at project root)
      const srcPath = path.resolve(
        __dirname,
        '../../../../../docs',
        'USER-MANUAL.pdf',
      );
      // Try using environment variable if set
      const envPath = this.configService.get<string>('USER_MANUAL_PDF_PATH');

      if (envPath && fs.existsSync(envPath)) {
        pdfPath = envPath;
      } else if (fs.existsSync(distAssetsPath)) {
        pdfPath = distAssetsPath;
      } else if (fs.existsSync(srcAssetsPath)) {
        pdfPath = srcAssetsPath;
      } else if (fs.existsSync(distPath)) {
        pdfPath = distPath;
      } else if (fs.existsSync(srcPath)) {
        pdfPath = srcPath;
      } else {
        pdfPath = null;
      }

      // Check if PDF exists
      if (!pdfPath || !fs.existsSync(pdfPath)) {
        console.warn(
          `User manual PDF not found. Tried paths: ${distAssetsPath}, ${srcAssetsPath}, ${distPath}, ${srcPath}${envPath ? `, ${envPath}` : ''}. Sending welcome email without attachment.`,
        );
        return this.sendEmail({
          to,
          subject: 'Welcome to SmartExpense UAE',
          html: this.buildWelcomeEmailHtml(userName, organizationName),
          text: this.buildWelcomeEmailText(userName, organizationName),
        });
      }

      // Read PDF file
      const pdfBuffer = fs.readFileSync(pdfPath);

      return this.sendEmail({
        to,
        subject: 'Welcome to SmartExpense UAE',
        html: this.buildWelcomeEmailHtml(userName, organizationName),
        text: this.buildWelcomeEmailText(userName, organizationName),
        attachments: [
          {
            filename: 'USER-MANUAL.pdf',
            content: pdfBuffer,
          },
        ],
      });
    } catch (error) {
      console.error('Error sending welcome email:', error);
      // Try to send without attachment if there's an error reading the PDF
      return this.sendEmail({
        to,
        subject: 'Welcome to SmartExpense UAE',
        html: this.buildWelcomeEmailHtml(userName, organizationName),
        text: this.buildWelcomeEmailText(userName, organizationName),
      });
    }
  }

  private buildWelcomeEmailHtml(
    userName: string,
    organizationName?: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to SmartExpense UAE</h1>
            </div>
            <div class="content">
              <h2>Hello ${userName}!</h2>
              ${
                organizationName
                  ? `<p>Welcome to <strong>${organizationName}</strong> on SmartExpense UAE!</p>`
                  : '<p>Welcome to SmartExpense UAE!</p>'
              }
              <p>We're excited to have you on board. SmartExpense UAE is a comprehensive expense management system designed to help you manage your expenses efficiently and stay compliant with UAE regulations.</p>
              <p>To help you get started, we've attached a comprehensive user manual that covers:</p>
              <ul>
                <li>Getting started with the platform</li>
                <li>Creating and managing expenses</li>
                <li>Understanding roles and permissions</li>
                <li>Using advanced features</li>
                <li>And much more!</li>
              </ul>
              <p>Please take a moment to review the attached user manual. It will help you make the most of SmartExpense UAE.</p>
              <p>If you have any questions or need assistance, please don't hesitate to reach out to our support team.</p>
              <p>Best regards,<br>The SmartExpense UAE Team</p>
            </div>
            <div class="footer">
              <p>This is an automated welcome email from SmartExpense UAE.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private buildWelcomeEmailText(
    userName: string,
    organizationName?: string,
  ): string {
    return `Hello ${userName}!

${
  organizationName
    ? `Welcome to ${organizationName} on SmartExpense UAE!\n\n`
    : 'Welcome to SmartExpense UAE!\n\n'
}We're excited to have you on board. SmartExpense UAE is a comprehensive expense management system designed to help you manage your expenses efficiently and stay compliant with UAE regulations.

To help you get started, we've attached a comprehensive user manual that covers:
- Getting started with the platform
- Creating and managing expenses
- Understanding roles and permissions
- Using advanced features
- And much more!

Please take a moment to review the attached user manual. It will help you make the most of SmartExpense UAE.

If you have any questions or need assistance, please don't hesitate to reach out to our support team.

Best regards,
The SmartExpense UAE Team

---
This is an automated welcome email from SmartExpense UAE.`;
  }

  isConfigured(): boolean {
    return this.resend !== null;
  }
}
