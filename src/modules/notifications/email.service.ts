import { Injectable, Inject, Optional, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
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
  private transporter: Transporter | null = null;

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => EmailTemplateService))
    @Optional()
    private readonly emailTemplateService?: EmailTemplateService,
  ) {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = this.configService.get<number>('SMTP_PORT', 587);
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPassword = this.configService.get<string>('SMTP_PASSWORD');

    if (smtpHost && smtpUser && smtpPassword) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
        connectionTimeout: 10000, // 10 seconds
        greetingTimeout: 10000, // 10 seconds
        socketTimeout: 10000, // 10 seconds
        // For non-465 ports, use STARTTLS
        requireTLS: smtpPort !== 465,
        tls: {
          rejectUnauthorized: false, // Allow self-signed certificates
        },
      });

      // Verify connection asynchronously (non-blocking)
      // This prevents startup delays if SMTP server is unreachable
      setImmediate(() => {
        const verifyTimeout = setTimeout(() => {
          console.warn(
            'SMTP verification timed out. Email service will attempt to connect when sending emails.',
          );
          this.transporter = null; // Disable until connection is verified
        }, 15000); // 15 second timeout for verification

        this.transporter?.verify((error) => {
          clearTimeout(verifyTimeout);
          if (error) {
            console.warn('SMTP connection verification failed:', error.message);
            console.warn(
              'Email service will attempt to connect when sending emails. Verify SMTP settings if emails fail.',
            );
            // Don't disable transporter - let it try on actual send
            // this.transporter = null;
          } else {
            console.log('Email service configured and verified successfully');
          }
        });
      });
    } else {
      console.warn(
        'SMTP configuration not found. Email service will be disabled.',
      );
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.transporter) {
      console.warn('Email service not configured. Skipping email send.');
      return false;
    }

    try {
      const from = this.configService.get<string>(
        'SMTP_FROM',
        'noreply@smartexpense-uae.com',
      );

      const mailOptions = {
        from,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
      };

      // Add timeout wrapper for sendMail
      const sendPromise = this.transporter.sendMail(mailOptions);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Email send timeout after 30 seconds')),
          30000,
        );
      });

      const info = (await Promise.race([sendPromise, timeoutPromise])) as any;
      console.log('Email sent successfully:', info.messageId);
      return true;
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';
      if (
        errorMessage.includes('timeout') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('Connection timeout')
      ) {
        console.error(
          'SMTP connection timeout. Check SMTP server connectivity and settings:',
          errorMessage,
        );
      } else if (errorMessage.includes('ECONNREFUSED')) {
        console.error(
          'SMTP connection refused. Check SMTP host and port:',
          errorMessage,
        );
      } else if (errorMessage.includes('authentication')) {
        console.error(
          'SMTP authentication failed. Check SMTP_USER and SMTP_PASSWORD:',
          errorMessage,
        );
      } else {
        console.error('Error sending email:', errorMessage);
      }
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
    const contentType =
      reportType === 'pdf'
        ? 'application/pdf'
        : reportType === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv';

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
          contentType,
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
            contentType: 'application/pdf',
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
    return this.transporter !== null;
  }
}
