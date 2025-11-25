import { ConfigService } from '@nestjs/config';
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
export declare class EmailService {
    private readonly configService;
    private transporter;
    constructor(configService: ConfigService);
    sendEmail(options: EmailOptions): Promise<boolean>;
    sendNotificationEmail(to: string, title: string, message: string, type?: string): Promise<boolean>;
    sendReportEmail(to: string, reportName: string, reportBuffer: Buffer, reportType: 'pdf' | 'xlsx' | 'csv'): Promise<boolean>;
    private buildNotificationHtml;
    private buildReportEmailHtml;
    isConfigured(): boolean;
}
