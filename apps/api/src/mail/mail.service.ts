import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

// Thrown by sendMail() when no SMTP is configured — callers decide what
// that means for them (e.g. auth's verification flow treats it as
// "not_configured", not a hard failure; see
// docs/stages/01-auth-and-email-setup.md Section 5.2).
export class MailNotConfiguredError extends Error {
  constructor() {
    super('SMTP is not configured');
  }
}

// One send path, provider-agnostic plain SMTP — see
// docs/stages/01-auth-and-email-setup.md Section 4.1. No
// provider-specific API is ever used here.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT
      ? Number(process.env.SMTP_PORT)
      : undefined;
    const user = process.env.SMTP_USER;
    const password = process.env.SMTP_PASSWORD;
    this.from = process.env.SMTP_FROM ?? 'Raptor <noreply@raptor.local>';

    if (host && port && user && password) {
      this.transporter = createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass: password },
      });
    } else {
      this.transporter = null;
      this.logger.warn(
        'SMTP is not configured (SMTP_HOST/PORT/USER/PASSWORD missing) — mail sending is disabled.',
      );
    }
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendMail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<void> {
    if (!this.transporter) {
      throw new MailNotConfiguredError();
    }
    await this.transporter.sendMail({ from: this.from, to, subject, text, html });
  }
}
