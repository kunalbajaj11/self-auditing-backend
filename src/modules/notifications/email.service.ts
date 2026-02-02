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
      'noreply@selfaccounting.ai',
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
    const subject = `SelfAccounting.AI: ${title}`;
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

    const subject = `SelfAccounting.AI Report: ${reportName}`;
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
              <h1>SelfAccounting.AI</h1>
            </div>
            <div class="content">
              <h2>${title}</h2>
              <p>${message.replace(/\n/g, '<br>')}</p>
            </div>
            <div class="footer">
              <p>This is an automated notification from SelfAccounting.AI.</p>
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
              <h1>SelfAccounting.AI</h1>
            </div>
            <div class="content">
              <h2>Report Ready: ${reportName}</h2>
              <p>Your requested report has been generated and is attached to this email.</p>
            </div>
            <div class="footer">
              <p>This is an automated notification from SelfAccounting.AI.</p>
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
          subject: 'Welcome to SelfAccounting.AI',
          html: this.buildWelcomeEmailHtml(userName, organizationName),
          text: this.buildWelcomeEmailText(userName, organizationName),
        });
      }

      // Read PDF file
      const pdfBuffer = fs.readFileSync(pdfPath);

      return this.sendEmail({
        to,
        subject: 'Welcome to SelfAccounting.AI',
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
        subject: 'Welcome to SelfAccounting.AI',
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
            .social { margin-top: 10px; }
            .social a { color: #1976d2; text-decoration: none; margin: 0 8px; }
            .social a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to SelfAccounting.AI</h1>
            </div>
            <div class="content">
              <h2>Hello ${userName}!</h2>
              ${
                organizationName
                  ? `<p>Welcome to <strong>${organizationName}</strong> on SelfAccounting.AI!</p>`
                  : '<p>Welcome to SelfAccounting.AI!</p>'
              }
              <p>We're excited to have you on board. SelfAccounting.AI is a comprehensive expense management system designed to help you manage your expenses efficiently and stay compliant with regulations.</p>
              <p>To help you get started, we've attached a comprehensive user manual that covers:</p>
              <ul>
                <li>Getting started with the platform</li>
                <li>Creating and managing expenses</li>
                <li>Understanding roles and permissions</li>
                <li>Using advanced features</li>
                <li>And much more!</li>
              </ul>
              <p>Please take a moment to review the attached user manual. It will help you make the most of SelfAccounting.AI.</p>
              <p>If you have any questions or need assistance, please don't hesitate to reach out to our support team.</p>
              <p>Best regards,<br>The SelfAccounting.AI Team</p>
            </div>
            <div class="footer">
              <p>This is an automated welcome email from SelfAccounting.AI.</p>
              <div class="social">
                <span>Follow us:</span>
                <a href="https://www.instagram.com/selfaccounting.ai?igsh=MWo0NDg5bDVodGYwdg==" target="_blank" rel="noopener noreferrer">Instagram</a>
                <a href="https://www.linkedin.com/company/111421971" target="_blank" rel="noopener noreferrer">LinkedIn</a>
              </div>
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
    ? `Welcome to ${organizationName} on SelfAccounting.AI!\n\n`
    : 'Welcome to SelfAccounting.AI!\n\n'
}We're excited to have you on board. SelfAccounting.AI is a comprehensive expense management system designed to help you manage your expenses efficiently and stay compliant with regulations.

To help you get started, we've attached a comprehensive user manual that covers:
- Getting started with the platform
- Creating and managing expenses
- Understanding roles and permissions
- Using advanced features
- And much more!

Please take a moment to review the attached user manual. It will help you make the most of SelfAccounting.AI.

If you have any questions or need assistance, please don't hesitate to reach out to our support team.

Best regards,
The SelfAccounting.AI Team

---
This is an automated welcome email from SelfAccounting.AI.

Follow us:
- Instagram: https://www.instagram.com/selfaccounting.ai?igsh=MWo0NDg5bDVodGYwdg==
- LinkedIn: https://www.linkedin.com/company/111421971`;
  }

  isConfigured(): boolean {
    return this.resend !== null;
  }

  /**
   * Send notification to super admin when a new organization registers
   */
  async sendNewRegistrationNotificationToSuperAdmin(registrationDetails: {
    licenseKey: string;
    organizationName: string;
    planType: string;
    adminName: string;
    adminEmail: string;
    adminPhone?: string;
    vatNumber?: string;
    address?: string;
    currency?: string;
    region?: string;
    contactPerson?: string;
    contactEmail?: string;
    storageQuotaMb?: number;
    registrationDate: Date;
  }): Promise<boolean> {
    const superAdminEmail = this.getSuperAdminNotificationEmail();

    // Sanitize organization name for subject line (null-safe, remove problematic chars, limit length)
    const rawOrgName = (registrationDetails.organizationName ?? '').trim();
    const safeOrgName = rawOrgName.replace(/[<>]/g, '').substring(0, 100);
    const subject = `🎉 New Registration: ${safeOrgName || 'New Client'}`;

    const html = this.buildNewRegistrationNotificationHtml(registrationDetails);
    const text = this.buildNewRegistrationNotificationText(registrationDetails);

    return this.sendEmail({
      to: superAdminEmail,
      subject,
      html,
      text,
    });
  }

  /**
   * Resolve super admin notification email: env SUPER_ADMIN_NOTIFICATION_EMAIL or backup.
   */
  private getSuperAdminNotificationEmail(): string {
    const backupEmail = 'kunalbajaj19@outlook.com';
    const configuredEmail = this.configService.get<string>(
      'SUPER_ADMIN_NOTIFICATION_EMAIL',
    );
    const rawEmail = (configuredEmail ?? '').trim();
    if (!rawEmail || !this.isValidEmail(rawEmail)) {
      console.warn(
        'SUPER_ADMIN_NOTIFICATION_EMAIL not set or invalid; using backup:',
        backupEmail,
      );
      return backupEmail;
    }
    return rawEmail;
  }

  /**
   * Simple email validation
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Escape HTML special characters to prevent XSS
   */
  private escapeHtml(text: string | undefined | null): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Sanitize user content for plain-text email (collapse newlines to avoid layout spoofing)
   */
  private sanitizeForPlainText(text: string | undefined | null): string {
    if (!text) return '';
    return text.replace(/\r?\n/g, ' ').trim();
  }

  private buildNewRegistrationNotificationHtml(details: {
    licenseKey: string;
    organizationName: string;
    planType: string;
    adminName: string;
    adminEmail: string;
    adminPhone?: string;
    vatNumber?: string;
    address?: string;
    currency?: string;
    region?: string;
    contactPerson?: string;
    contactEmail?: string;
    storageQuotaMb?: number;
    registrationDate: Date;
  }): string {
    const formatDate = (date: Date) => {
      return date.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      });
    };

    // Escape all user-provided data to prevent XSS
    const safe = {
      organizationName: this.escapeHtml(details.organizationName),
      planType: this.escapeHtml(details.planType),
      adminName: this.escapeHtml(details.adminName),
      adminEmail: this.escapeHtml(details.adminEmail),
      adminPhone: this.escapeHtml(details.adminPhone),
      vatNumber: this.escapeHtml(details.vatNumber),
      address: this.escapeHtml(details.address),
      currency: this.escapeHtml(details.currency),
      region: this.escapeHtml(details.region),
      contactPerson: this.escapeHtml(details.contactPerson),
      contactEmail: this.escapeHtml(details.contactEmail),
      licenseKey: this.escapeHtml(details.licenseKey),
      storageQuotaMb: details.storageQuotaMb,
    };

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 650px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .header h1 { margin: 0; font-size: 24px; }
            .header p { margin: 10px 0 0 0; opacity: 0.9; }
            .content { padding: 30px; background-color: #ffffff; border: 1px solid #e0e0e0; border-top: none; }
            .section { margin-bottom: 25px; }
            .section-title { font-size: 16px; font-weight: bold; color: #1976d2; margin-bottom: 15px; padding-bottom: 8px; border-bottom: 2px solid #e3f2fd; }
            .detail-row { display: flex; margin-bottom: 12px; }
            .detail-label { font-weight: 600; color: #666; width: 160px; flex-shrink: 0; }
            .detail-value { color: #333; flex: 1; }
            .highlight-box { background-color: #e3f2fd; border-left: 4px solid #1976d2; padding: 15px; margin: 20px 0; border-radius: 0 4px 4px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; background-color: #f5f5f5; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0; border-top: none; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
            .badge-success { background-color: #c8e6c9; color: #2e7d32; }
            table { width: 100%; border-collapse: collapse; }
            td { padding: 10px 0; vertical-align: top; }
            td.label { width: 160px; font-weight: 600; color: #666; }
            td.value { color: #333; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 New Client Registration</h1>
              <p>A new organization has registered on SelfAccounting.AI</p>
            </div>
            <div class="content">
              <div class="highlight-box">
                <strong>Organization:</strong> ${safe.organizationName}<br>
                <strong>Registered:</strong> ${formatDate(details.registrationDate)}
              </div>
              
              <div class="section">
                <div class="section-title">📋 Organization Details</div>
                <table>
                  <tr>
                    <td class="label">Organization Name</td>
                    <td class="value">${safe.organizationName}</td>
                  </tr>
                  <tr>
                    <td class="label">Plan Type</td>
                    <td class="value"><span class="badge badge-success">${safe.planType}</span></td>
                  </tr>
                  ${safe.vatNumber ? `<tr><td class="label">VAT Number</td><td class="value">${safe.vatNumber}</td></tr>` : ''}
                  ${safe.address ? `<tr><td class="label">Address</td><td class="value">${safe.address}</td></tr>` : ''}
                  ${safe.currency ? `<tr><td class="label">Currency</td><td class="value">${safe.currency}</td></tr>` : ''}
                  ${safe.region ? `<tr><td class="label">Region</td><td class="value">${safe.region}</td></tr>` : ''}
                  ${safe.storageQuotaMb ? `<tr><td class="label">Storage Quota</td><td class="value">${safe.storageQuotaMb} MB</td></tr>` : ''}
                </table>
              </div>

              <div class="section">
                <div class="section-title">👤 Admin User Details</div>
                <table>
                  <tr>
                    <td class="label">Admin Name</td>
                    <td class="value">${safe.adminName}</td>
                  </tr>
                  <tr>
                    <td class="label">Admin Email</td>
                    <td class="value"><a href="mailto:${safe.adminEmail}">${safe.adminEmail}</a></td>
                  </tr>
                  ${safe.adminPhone ? `<tr><td class="label">Admin Phone</td><td class="value">${safe.adminPhone}</td></tr>` : ''}
                </table>
              </div>

              ${
                safe.contactPerson || safe.contactEmail
                  ? `
              <div class="section">
                <div class="section-title">📞 Contact Information</div>
                <table>
                  ${safe.contactPerson ? `<tr><td class="label">Contact Person</td><td class="value">${safe.contactPerson}</td></tr>` : ''}
                  ${safe.contactEmail ? `<tr><td class="label">Contact Email</td><td class="value"><a href="mailto:${safe.contactEmail}">${safe.contactEmail}</a></td></tr>` : ''}
                </table>
              </div>
              `
                  : ''
              }

              <div class="section">
                <div class="section-title">🔑 License Information</div>
                <table>
                  <tr>
                    <td class="label">License Key</td>
                    <td class="value" style="font-family: monospace; background-color: #f5f5f5; padding: 8px; border-radius: 4px;">${safe.licenseKey}</td>
                  </tr>
                </table>
              </div>
            </div>
            <div class="footer">
              <p>This is an automated notification from SelfAccounting.AI</p>
              <p style="color: #999; margin-top: 10px;">Registration tracked at ${formatDate(details.registrationDate)}</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private buildNewRegistrationNotificationText(details: {
    licenseKey: string;
    organizationName: string;
    planType: string;
    adminName: string;
    adminEmail: string;
    adminPhone?: string;
    vatNumber?: string;
    address?: string;
    currency?: string;
    region?: string;
    contactPerson?: string;
    contactEmail?: string;
    storageQuotaMb?: number;
    registrationDate: Date;
  }): string {
    const formatDate = (date: Date) => {
      return date.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      });
    };

    let text = `
🎉 NEW CLIENT REGISTRATION - SelfAccounting.AI
================================================

A new organization has registered on SelfAccounting.AI

ORGANIZATION DETAILS
--------------------
Organization Name: ${this.sanitizeForPlainText(details.organizationName)}
Plan Type: ${this.sanitizeForPlainText(details.planType)}`;

    if (details.vatNumber)
      text += `\nVAT Number: ${this.sanitizeForPlainText(details.vatNumber)}`;
    if (details.address)
      text += `\nAddress: ${this.sanitizeForPlainText(details.address)}`;
    if (details.currency)
      text += `\nCurrency: ${this.sanitizeForPlainText(details.currency)}`;
    if (details.region)
      text += `\nRegion: ${this.sanitizeForPlainText(details.region)}`;
    if (details.storageQuotaMb)
      text += `\nStorage Quota: ${details.storageQuotaMb} MB`;

    text += `

ADMIN USER DETAILS
------------------
Admin Name: ${this.sanitizeForPlainText(details.adminName)}
Admin Email: ${this.sanitizeForPlainText(details.adminEmail)}`;

    if (details.adminPhone)
      text += `\nAdmin Phone: ${this.sanitizeForPlainText(details.adminPhone)}`;

    if (details.contactPerson || details.contactEmail) {
      text += `

CONTACT INFORMATION
-------------------`;
      if (details.contactPerson)
        text += `\nContact Person: ${this.sanitizeForPlainText(details.contactPerson)}`;
      if (details.contactEmail)
        text += `\nContact Email: ${this.sanitizeForPlainText(details.contactEmail)}`;
    }

    text += `

LICENSE INFORMATION
-------------------
License Key: ${this.sanitizeForPlainText(details.licenseKey)}

---
Registration Date: ${formatDate(details.registrationDate)}
This is an automated notification from SelfAccounting.AI
`;

    return text;
  }

  /**
   * Send notification to super admin when a new license key is created
   */
  async sendNewLicenseCreationNotificationToSuperAdmin(details: {
    key: string;
    planType?: string;
    maxUsers?: number;
    storageQuotaMb?: number;
    maxUploads?: number;
    notes?: string;
    region?: string;
    validityDays?: number;
    email: string;
    expiresAt: Date;
    createdAt: Date;
    createdById?: string;
  }): Promise<boolean> {
    const superAdminEmail = this.getSuperAdminNotificationEmail();
    const rawKey = (details.key ?? '').trim();
    const subjectKey = rawKey.replace(/[<>]/g, '').substring(0, 50);
    const subject = `🔑 New License Created: ${subjectKey || 'New License'}${rawKey.length > 50 ? '...' : ''}`;

    const html = this.buildNewLicenseCreationNotificationHtml(details);
    const text = this.buildNewLicenseCreationNotificationText(details);

    return this.sendEmail({
      to: superAdminEmail,
      subject,
      html,
      text,
    });
  }

  private buildNewLicenseCreationNotificationHtml(details: {
    key: string;
    planType?: string;
    maxUsers?: number;
    storageQuotaMb?: number;
    maxUploads?: number;
    notes?: string;
    region?: string;
    validityDays?: number;
    email: string;
    expiresAt: Date;
    createdAt: Date;
    createdById?: string;
  }): string {
    const formatDate = (date: Date) =>
      date.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      });

    const safe = {
      key: this.escapeHtml(details.key),
      planType: this.escapeHtml(details.planType),
      notes: this.escapeHtml(details.notes),
      region: this.escapeHtml(details.region),
      email: this.escapeHtml(details.email),
    };

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 650px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px; background-color: #fff; border: 1px solid #e0e0e0; border-top: none; }
            .section-title { font-size: 16px; font-weight: bold; color: #2e7d32; margin-bottom: 15px; padding-bottom: 8px; border-bottom: 2px solid #e8f5e9; }
            .highlight-box { background-color: #e8f5e9; border-left: 4px solid #2e7d32; padding: 15px; margin: 20px 0; border-radius: 0 4px 4px 0; }
            table { width: 100%; border-collapse: collapse; }
            td { padding: 10px 0; vertical-align: top; }
            td.label { width: 180px; font-weight: 600; color: #666; }
            td.value { color: #333; }
            .license-key { font-family: monospace; background-color: #f5f5f5; padding: 10px; border-radius: 4px; word-break: break-all; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; background-color: #f5f5f5; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0; border-top: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔑 New License Key Created</h1>
              <p>A new license key has been created on SelfAccounting.AI</p>
            </div>
            <div class="content">
              <div class="highlight-box">
                <strong>License Key:</strong> <span class="license-key">${safe.key}</span><br>
                <strong>Created:</strong> ${formatDate(details.createdAt)}
              </div>
              <div class="section-title">📋 License Form Details</div>
              <table>
                <tr><td class="label">License Key</td><td class="value"><span class="license-key">${safe.key}</span></td></tr>
                <tr><td class="label">Recipient Email</td><td class="value"><a href="mailto:${safe.email}">${safe.email}</a></td></tr>
                ${safe.planType ? `<tr><td class="label">Plan Type</td><td class="value">${safe.planType}</td></tr>` : ''}
                ${details.maxUsers != null ? `<tr><td class="label">Max Users</td><td class="value">${details.maxUsers}</td></tr>` : ''}
                ${details.storageQuotaMb != null ? `<tr><td class="label">Storage Quota (MB)</td><td class="value">${details.storageQuotaMb}</td></tr>` : ''}
                ${details.maxUploads != null ? `<tr><td class="label">Max Uploads</td><td class="value">${details.maxUploads}</td></tr>` : ''}
                ${details.validityDays != null ? `<tr><td class="label">Validity (Days)</td><td class="value">${details.validityDays}</td></tr>` : ''}
                <tr><td class="label">Expires At</td><td class="value">${formatDate(details.expiresAt)}</td></tr>
                ${safe.region ? `<tr><td class="label">Region</td><td class="value">${safe.region}</td></tr>` : ''}
                ${safe.notes ? `<tr><td class="label">Notes</td><td class="value">${safe.notes}</td></tr>` : ''}
                ${details.createdById ? `<tr><td class="label">Created By (User ID)</td><td class="value">${this.escapeHtml(details.createdById)}</td></tr>` : ''}
              </table>
            </div>
            <div class="footer">
              <p>This is an automated notification from SelfAccounting.AI</p>
              <p style="color: #999; margin-top: 10px;">License created at ${formatDate(details.createdAt)}</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private buildNewLicenseCreationNotificationText(details: {
    key: string;
    planType?: string;
    maxUsers?: number;
    storageQuotaMb?: number;
    maxUploads?: number;
    notes?: string;
    region?: string;
    validityDays?: number;
    email: string;
    expiresAt: Date;
    createdAt: Date;
    createdById?: string;
  }): string {
    const formatDate = (date: Date) =>
      date.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      });

    let text = `
🔑 NEW LICENSE KEY CREATED - SelfAccounting.AI
================================================

LICENSE DETAILS
---------------
License Key: ${this.sanitizeForPlainText(details.key)}
Recipient Email: ${this.sanitizeForPlainText(details.email)}
Expires At: ${formatDate(details.expiresAt)}`;

    if (details.planType)
      text += `\nPlan Type: ${this.sanitizeForPlainText(details.planType)}`;
    if (details.maxUsers != null) text += `\nMax Users: ${details.maxUsers}`;
    if (details.storageQuotaMb != null)
      text += `\nStorage Quota (MB): ${details.storageQuotaMb}`;
    if (details.maxUploads != null)
      text += `\nMax Uploads: ${details.maxUploads}`;
    if (details.validityDays != null)
      text += `\nValidity (Days): ${details.validityDays}`;
    if (details.region)
      text += `\nRegion: ${this.sanitizeForPlainText(details.region)}`;
    if (details.notes)
      text += `\nNotes: ${this.sanitizeForPlainText(details.notes)}`;
    if (details.createdById)
      text += `\nCreated By (User ID): ${this.sanitizeForPlainText(details.createdById)}`;

    text += `

---
Created At: ${formatDate(details.createdAt)}
This is an automated notification from SelfAccounting.AI
`;
    return text;
  }
}
