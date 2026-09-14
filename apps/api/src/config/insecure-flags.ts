import type { TransportConfig } from "./transport.config.js";
import type { SmtpConfig } from "./smtp.config.js";

/**
 * The insecure-opt-in flags an operator can turn on (ADR 0018) — named here
 * once so boot logging and `/health` can never disagree about which flags
 * exist or what they're called.
 */
export function activeInsecureFlags(
  transport: Pick<TransportConfig, "allowInsecureTransport">,
  smtp: Pick<SmtpConfig, "allowPlaintext">,
): string[] {
  const flags: string[] = [];
  if (transport.allowInsecureTransport) flags.push("ALLOW_INSECURE_TRANSPORT");
  if (smtp.allowPlaintext) flags.push("SMTP_ALLOW_PLAINTEXT");
  return flags;
}
