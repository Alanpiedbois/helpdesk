import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Email } from './email-rules.js';

/** SMTP sender. In development, SMTP points at Mailpit: every e-mail lands in http://localhost:8025. */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.transport = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST', 'localhost'),
      port: Number(config.get('SMTP_PORT', 1025)),
      secure: false,
    });
    this.from = config.get<string>('MAIL_FROM', 'Helpdesk <support@helpdesk.local>');
  }

  async send(email: Email): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...email });
    this.logger.log(`Sent "${email.subject}" to ${email.to}`);
  }
}
