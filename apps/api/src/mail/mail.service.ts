import { Inject, Injectable } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";
import smtpConfig from "../config/smtp.config.js";

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
}

export type SendMailResult =
  | { outcome: "sent"; relayResponse: string }
  | { outcome: "failed"; error: string };

/**
 * The one place a message crosses to the SMTP relay (spec §11). No retry
 * here — a failed try is written as its own event and the 5-attempts-over-
 * an-hour retry (§11.3) is the scheduled tick's job (#72), not this
 * service's. This is a single, best-effort attempt.
 */
@Injectable()
export class MailService {
  private transporter: Transporter | null = null;

  constructor(@Inject(smtpConfig.KEY) private readonly smtp: ConfigType<typeof smtpConfig>) {}

  private transport(): Transporter {
    if (!this.transporter) {
      this.transporter = createTransport({
        host: this.smtp.host,
        port: this.smtp.port,
        secure: this.smtp.secure,
        requireTLS: this.smtp.startTls,
        auth: { user: this.smtp.user, pass: this.smtp.pass },
        // Boot validation (ticket #85) already refuses a plaintext
        // configuration unless SMTP_ALLOW_PLAINTEXT is set — this is not a
        // second guard, just nodemailer's own opt-in for the same case.
        ignoreTLS: this.smtp.allowPlaintext && !this.smtp.startTls && !this.smtp.secure,
      });
    }
    return this.transporter;
  }

  async send(input: SendMailInput): Promise<SendMailResult> {
    try {
      const info: { response?: string; messageId: string } = await this.transport().sendMail({
        from: this.smtp.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
      });
      return { outcome: "sent", relayResponse: info.response ?? info.messageId };
    } catch (error) {
      return { outcome: "failed", error: error instanceof Error ? error.message : String(error) };
    }
  }
}
