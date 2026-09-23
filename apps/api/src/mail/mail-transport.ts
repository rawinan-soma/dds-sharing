import nodemailer from 'nodemailer';

export interface SendMailInput {
  to: string;
  from: string;
  subject: string;
  html: string;
}

export interface SendMailResult {
  /** Whatever the relay's SMTP conversation returned — recorded verbatim on `mail_sent` (spec §12.4). */
  relayResponse: string;
}

export interface MailTransport {
  send(input: SendMailInput): Promise<SendMailResult>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  /** Implicit TLS. Mutually exclusive with `startTls` (`env.schema.ts` enforces this at boot). */
  secure: boolean;
  /** Explicit STARTTLS on the submission port — the relay's actual shape (spec §11.2). */
  startTls: boolean;
  user: string;
  pass: string;
}

export function createSmtpTransport(config: SmtpConfig): MailTransport {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.startTls,
    auth: { user: config.user, pass: config.pass },
  });

  return {
    async send({ to, from, subject, html }) {
      const info = await transporter.sendMail({ to, from, subject, html });
      return { relayResponse: info.response ?? '' };
    },
  };
}
