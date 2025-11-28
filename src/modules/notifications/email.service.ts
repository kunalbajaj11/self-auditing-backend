import { Injectable, Inject, Optional, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { NotificationType } from '../../common/enums/notification-type.enum';
import { EmailTemplateService } from './email-template.service';

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
    const smtpFrom = this.configService.get<string>(
      'SMTP_FROM',
      'noreply@smartexpense-uae.com',
    );

    if (smtpHost && smtpUser && smtpPassword) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      });

      // Verify connection
      this.transporter.verify((error) => {
        if (error) {
          console.warn('SMTP connection failed:', error.message);
          console.warn('Email service will be disabled. Configure SMTP settings to enable.');
        } else {
          console.log('Email service configured successfully');
        }
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

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', info.messageId);
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
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
        console.warn('Failed to use email template, falling back to default:', error);
      }
    }

    // Fallback to default email format
    const subject = `SmartExpense: ${title}`;
    const html = this.buildNotificationHtml(title, message, type);

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

  private buildNotificationHtml(
    title: string,
    message: string,
    type?: string,
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

  isConfigured(): boolean {
    return this.transporter !== null;
  }
}

