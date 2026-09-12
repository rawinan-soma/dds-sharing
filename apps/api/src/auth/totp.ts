import * as OTPAuth from "otpauth";

// ⚠️ Defaults, and only the defaults (spec §17.5, ticket #64). Google
// Authenticator ignores `algorithm` and `digits` in the `otpauth://`
// enrolment URI and always computes SHA-1/6-digit/30-second — a server
// configured for anything else writes a URI the phone silently disregards,
// and both sides then fail with the same generic message. Never change
// these without reopening that decision.
const TOTP_ALGORITHM = "SHA1";
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const TOTP_ISSUER = "DDS Sharing";

// The accepted validation window is ±1 step (spec §17.5). A second, wider
// window exists only to *label* a failure as clock drift rather than an
// attack (§17.5: "a login_failed whose code was valid one or two TOTP steps
// ago is recorded distinctly") — it never grants access on its own.
const TOTP_ACCEPT_WINDOW = 1;
const TOTP_DRIFT_LABEL_WINDOW = 2;

export function generateTotpSecret(): OTPAuth.Secret {
  return new OTPAuth.Secret({ size: 20 });
}

function buildTotp(username: string, secret: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: username,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

/** The `otpauth://` enrolment URI for the terminal QR — SHA-1/6/30, always. */
export function totpProvisioningUri(username: string, secret: OTPAuth.Secret): string {
  return buildTotp(username, secret.base32).toString();
}

export type TotpVerifyResult =
  | { outcome: "valid"; step: number }
  | { outcome: "drifted" }
  | { outcome: "invalid" };

/**
 * Verifies a submitted TOTP code. `lastUsedStep`, when given, blocks replay
 * of a code already spent — a used code cannot be presented again even
 * though it would otherwise still fall inside the accept window.
 */
export function verifyTotpCode(secret: string, code: string, lastUsedStep?: number | null): TotpVerifyResult {
  const totp = buildTotp("reviewer", secret);
  const currentStep = Math.floor(Date.now() / 1000 / TOTP_PERIOD);

  const delta = totp.validate({ token: code, window: TOTP_ACCEPT_WINDOW });
  if (delta !== null) {
    const step = currentStep + delta;
    if (lastUsedStep != null && step <= lastUsedStep) {
      return { outcome: "invalid" };
    }
    return { outcome: "valid", step };
  }

  const driftDelta = totp.validate({ token: code, window: TOTP_DRIFT_LABEL_WINDOW });
  if (driftDelta !== null) {
    return { outcome: "drifted" };
  }

  return { outcome: "invalid" };
}
