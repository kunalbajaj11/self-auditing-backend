import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Contact } from '../../entities/contact.entity';
import { SubmitContactDto } from './dto/submit-contact.dto';
import { EmailService } from '../notifications/email.service';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async submitContactForm(dto: SubmitContactDto): Promise<Contact> {
    // Save contact submission to database
    const contact = this.contactRepository.create({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      company: dto.company,
      message: dto.message,
      isRead: false,
    });

    const savedContact = await this.contactRepository.save(contact);

    // Send email notification to admin
    await this.sendContactNotificationEmail(savedContact);

    // Send confirmation email to user
    await this.sendConfirmationEmail(savedContact);

    return savedContact;
  }

  private async sendContactNotificationEmail(contact: Contact): Promise<void> {
    const adminEmail = this.configService.get<string>(
      'CONTACT_ADMIN_EMAIL',
      this.configService.get<string>('SMTP_FROM', 'admin@smartexpense-uae.com'),
    );

    const subject = `New Contact Form Submission from ${contact.name}`;
    const html = this.buildAdminNotificationHtml(contact);

    this.emailService
      .sendEmail({
        to: adminEmail,
        subject,
        html,
        text: this.buildAdminNotificationText(contact),
      })
      .then((sent) => {
        if (sent) {
          console.log(`Contact notification email sent to ${adminEmail}`);
        } else {
          console.warn('Failed to send contact notification email');
        }
      })
      .catch((error) => {
        console.error('Error sending contact notification email:', error);
      });
  }

  private async sendConfirmationEmail(contact: Contact): Promise<void> {
    const subject = 'Thank you for contacting SelfAccounting.AI';
    const html = this.buildConfirmationHtml(contact);

    this.emailService
      .sendEmail({
        to: contact.email,
        subject,
        html,
        text: this.buildConfirmationText(contact),
      })
      .then((sent) => {
        if (sent) {
          console.log(`Confirmation email sent to ${contact.email}`);
        } else {
          console.warn('Failed to send confirmation email');
        }
      })
      .catch((error) => {
        console.error('Error sending confirmation email:', error);
      });
  }

  private buildAdminNotificationHtml(contact: Contact): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .field { margin-bottom: 15px; }
            .label { font-weight: bold; color: #667eea; }
            .value { margin-top: 5px; padding: 10px; background-color: white; border-left: 3px solid #667eea; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>SelfAccounting.AI</h1>
              <h2>New Contact Form Submission</h2>
            </div>
            <div class="content">
              <div class="field">
                <div class="label">Name:</div>
                <div class="value">${this.escapeHtml(contact.name)}</div>
              </div>
              <div class="field">
                <div class="label">Email:</div>
                <div class="value">${this.escapeHtml(contact.email)}</div>
              </div>
              <div class="field">
                <div class="label">Phone:</div>
                <div class="value">${this.escapeHtml(contact.phone || 'Not provided')}</div>
              </div>
              ${
                contact.company
                  ? `
              <div class="field">
                <div class="label">Company:</div>
                <div class="value">${this.escapeHtml(contact.company)}</div>
              </div>
              `
                  : ''
              }
              <div class="field">
                <div class="label">Message:</div>
                <div class="value">${this.escapeHtml(contact.message).replace(/\n/g, '<br>')}</div>
              </div>
              <div class="field">
                <div class="label">Submitted At:</div>
                <div class="value">${contact.createdAt.toLocaleString()}</div>
              </div>
            </div>
            <div class="footer">
              <p>This is an automated notification from SelfAccounting.AI contact form.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private buildAdminNotificationText(contact: Contact): string {
    return `
New Contact Form Submission

Name: ${contact.name}
Email: ${contact.email}
Phone: ${contact.phone || 'Not provided'}
${contact.company ? `Company: ${contact.company}\n` : ''}
Message:
${contact.message}

Submitted At: ${contact.createdAt.toLocaleString()}
    `.trim();
  }

  private buildConfirmationHtml(contact: Contact): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; }
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
              <h2>Thank you for contacting us!</h2>
              <p>Hi ${this.escapeHtml(contact.name)},</p>
              <p>We have received your message and will get back to you as soon as possible.</p>
              <p>Your message:</p>
              <p style="padding: 15px; background-color: white; border-left: 3px solid #667eea; font-style: italic;">
                "${this.escapeHtml(contact.message)}"
              </p>
              <p>Our team typically responds within 24-48 hours.</p>
              <p>Best regards,<br>The SelfAccounting.AI Team</p>
            </div>
            <div class="footer">
              <p>This is an automated confirmation email from SelfAccounting.AI.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private buildConfirmationText(contact: Contact): string {
    return `
Thank you for contacting SelfAccounting.AI!

Hi ${contact.name},

We have received your message and will get back to you as soon as possible.

Your message:
"${contact.message}"

Our team typically responds within 24-48 hours.

Best regards,
The SelfAccounting.AI Team
    `.trim();
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
