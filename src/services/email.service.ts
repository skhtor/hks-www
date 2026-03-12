import { config } from '../config/env';
import { notificationTemplateService } from './notification-template.service';

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

export class EmailService {
  private apiKey: string | undefined;
  private fromAddress: string;

  constructor() {
    this.apiKey = config.email.apiKey;
    this.fromAddress = config.email.fromAddress ?? 'noreply@danceschool.com';
  }

  async sendEmail(to: string, subject: string, body: string, html?: string): Promise<void> {
    if (!this.apiKey) {
      // Development mode: log to console
      console.log('[EmailService] Development mode - email not sent:');
      console.log(`  To: ${to}`);
      console.log(`  Subject: ${subject}`);
      console.log(`  Body: ${body}`);
      return;
    }

    const payload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: this.fromAddress },
      subject,
      content: [
        { type: 'text/plain', value: body },
        ...(html ? [{ type: 'text/html', value: html }] : []),
      ],
    };

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SendGrid API error ${response.status}: ${errorText}`);
    }
  }

  async sendTemplatedEmail(
    to: string,
    templateId: string,
    variables: Record<string, string>
  ): Promise<void> {
    const rendered = notificationTemplateService.renderTemplate(templateId, variables);
    await this.sendEmail(to, rendered.subject, rendered.body);
  }
}

export const emailService = new EmailService();
