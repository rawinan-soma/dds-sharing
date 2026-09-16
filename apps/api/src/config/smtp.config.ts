import { registerAs } from "@nestjs/config";

export const SMTP_CONFIG_ENV_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_STARTTLS",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "SMTP_ALLOW_PLAINTEXT",
] as const;

export interface SmtpConfig {
  host: string;
  port: number;
  startTls: boolean;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  allowPlaintext: boolean;
}

export default registerAs(
  "smtp",
  (): SmtpConfig => ({
    host: process.env.SMTP_HOST as string,
    port: Number(process.env.SMTP_PORT),
    startTls: process.env.SMTP_STARTTLS === "true",
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER as string,
    pass: process.env.SMTP_PASS as string,
    from: process.env.SMTP_FROM as string,
    allowPlaintext: process.env.SMTP_ALLOW_PLAINTEXT === "true",
  }),
);
