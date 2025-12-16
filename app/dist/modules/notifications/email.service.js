'use strict';
var __decorate =
  (this && this.__decorate) ||
  function (decorators, target, key, desc) {
    var c = arguments.length,
      r =
        c < 3
          ? target
          : desc === null
            ? (desc = Object.getOwnPropertyDescriptor(target, key))
            : desc,
      d;
    if (typeof Reflect === 'object' && typeof Reflect.decorate === 'function')
      r = Reflect.decorate(decorators, target, key, desc);
    else
      for (var i = decorators.length - 1; i >= 0; i--)
        if ((d = decorators[i]))
          r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return (c > 3 && r && Object.defineProperty(target, key, r), r);
  };
var __metadata =
  (this && this.__metadata) ||
  function (k, v) {
    if (typeof Reflect === 'object' && typeof Reflect.metadata === 'function')
      return Reflect.metadata(k, v);
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.EmailService = void 0;
const common_1 = require('@nestjs/common');
const config_1 = require('@nestjs/config');
const nodemailer = require('nodemailer');
let EmailService = class EmailService {
  constructor(configService) {
    this.configService = configService;
    this.transporter = null;
    const smtpHost = this.configService.get('SMTP_HOST');
    const smtpPort = this.configService.get('SMTP_PORT', 587);
    const smtpUser = this.configService.get('SMTP_USER');
    const smtpPassword = this.configService.get('SMTP_PASSWORD');
    const smtpFrom = this.configService.get(
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
      this.transporter.verify((error) => {
        if (error) {
          console.warn('SMTP connection failed:', error.message);
          console.warn(
            'Email service will be disabled. Configure SMTP settings to enable.',
          );
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
  async sendEmail(options) {
    if (!this.transporter) {
      console.warn('Email service not configured. Skipping email send.');
      return false;
    }
    try {
      const from = this.configService.get(
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
  async sendNotificationEmail(to, title, message, type) {
    const subject = `SmartExpense: ${title}`;
    const html = this.buildNotificationHtml(title, message, type);
    return this.sendEmail({
      to,
      subject,
      html,
      text: message,
    });
  }
  async sendReportEmail(to, reportName, reportBuffer, reportType) {
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
  buildNotificationHtml(title, message, type) {
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
  buildReportEmailHtml(reportName) {
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
  isConfigured() {
    return this.transporter !== null;
  }
};
exports.EmailService = EmailService;
exports.EmailService = EmailService = __decorate(
  [
    (0, common_1.Injectable)(),
    __metadata('design:paramtypes', [config_1.ConfigService]),
  ],
  EmailService,
);
//# sourceMappingURL=email.service.js.map
