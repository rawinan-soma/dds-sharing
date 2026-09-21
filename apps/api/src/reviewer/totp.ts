import { timingSafeEqual } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';

// TOTP parameters are the defaults and only the defaults: SHA-1, 6 digits, 30
// seconds. Google Authenticator ignores `algorithm` and `digits` in the
// enrolment URI and always computes with these, so a server configured for
// anything else would agree with itself and disagree with every phone, and
// nothing on either side would say why. Do not make these configurable.
const ALGORITHM = 'SHA1';
const DIGITS = 6;
export const TOTP_STEP_SECONDS = 30;
const ISSUER = 'DDS sharing';

/** The accepted window: the current step and one either side (§17.5). */
const WINDOW = 1;
/** How far back a code is still recognised as drift rather than a wrong code. */
const DRIFT_LOOKBACK = 2;

const totpFor = (secret: string, label = 'reviewer') =>
  new TOTP({
    issuer: ISSUER,
    label,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: TOTP_STEP_SECONDS,
    secret: Secret.fromBase32(secret),
  });

/** A fresh 160-bit secret, base32. */
export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

/** The `otpauth://` URI the seeding QR encodes. */
export function enrolmentUri(username: string, secret: string): string {
  return totpFor(secret, username).toString();
}

export type TotpResult =
  | {
      ok: true;
      /** The step the code belongs to; the caller records it to stop replay. */
      step: number;
      /** The code belongs to a past step: the phone lags the host clock. */
      drift: boolean;
    }
  | {
      ok: false;
      /** Valid one or two steps ago: a host clock fault, not an attack. */
      drift: boolean;
    };

const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Checks a code against the window around `nowMs`. `lastUsedStep` is the newest
 * step already spent on this account: a code for that step or an earlier one is
 * a replay and never verifies, and is not drift either.
 */
export function verifyTotp(
  secret: string,
  code: string,
  nowMs: number,
  lastUsedStep: number | null,
): TotpResult {
  if (!/^\d{6}$/.test(code)) return { ok: false, drift: false };

  const totp = totpFor(secret);
  const currentStep = Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
  let matchedStep: number | null = null;
  // Every offset is compared, none short-circuits the others.
  for (let offset = -DRIFT_LOOKBACK; offset <= WINDOW; offset++) {
    const step = currentStep + offset;
    const expected = totp.generate({
      timestamp: step * TOTP_STEP_SECONDS * 1000,
    });
    if (equal(expected, code) && matchedStep === null) matchedStep = step;
  }

  if (matchedStep === null) return { ok: false, drift: false };
  if (lastUsedStep !== null && matchedStep <= lastUsedStep) {
    return { ok: false, drift: false };
  }
  const drift = matchedStep < currentStep;
  if (matchedStep < currentStep - WINDOW) return { ok: false, drift };
  return { ok: true, step: matchedStep, drift };
}
