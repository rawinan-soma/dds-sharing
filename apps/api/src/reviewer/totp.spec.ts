import { describe, expect, it } from 'vitest';
import {
  TOTP_STEP_SECONDS,
  enrolmentUri,
  generateTotpSecret,
  verifyTotp,
} from './totp';
import { phoneCode } from '../../test/support/phone-authenticator';

const NOW = Date.UTC(2026, 8, 21, 9, 0, 10);
const step = (ms: number) => Math.floor(ms / 1000 / TOTP_STEP_SECONDS);

describe('TOTP defaults (§17.5)', () => {
  // The RFC 6238 appendix B vector for SHA-1: ASCII "12345678901234567890" at
  // T=59 is 94287082 in 8 digits, so 287082 in 6.
  it('agrees with the RFC 6238 test vector', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(phoneCode(secret, 59_000)).toBe('287082');
    expect(verifyTotp(secret, '287082', 59_000, null).ok).toBe(true);
  });

  it('verifies a code an authenticator using SHA-1, 6 digits, 30 seconds shows', () => {
    const secret = generateTotpSecret();
    const result = verifyTotp(secret, phoneCode(secret, NOW), NOW, null);
    expect(result).toEqual({ ok: true, step: step(NOW), drift: false });
  });

  it('writes an enrolment URI with no parameter Google Authenticator would ignore', () => {
    const secret = generateTotpSecret();
    const uri = new URL(enrolmentUri('nan.reviewer', secret));
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.host).toBe('totp');
    expect(uri.searchParams.get('secret')).toBe(secret);
    // Absent, or exactly the default: never anything Google would silently drop.
    for (const [name, value] of [
      ['algorithm', 'SHA1'],
      ['digits', '6'],
      ['period', '30'],
    ] as const) {
      const given = uri.searchParams.get(name);
      expect(given === null || given === value).toBe(true);
    }
  });

  it('generates a 160-bit base32 secret', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret()).not.toBe(secret);
  });

  it('accepts the previous and the next step, and rejects two away', () => {
    const secret = generateTotpSecret();
    const behind = phoneCode(secret, NOW - 30_000);
    const ahead = phoneCode(secret, NOW + 30_000);
    expect(verifyTotp(secret, behind, NOW, null).ok).toBe(true);
    expect(verifyTotp(secret, ahead, NOW, null).ok).toBe(true);
    expect(
      verifyTotp(secret, phoneCode(secret, NOW - 60_000), NOW, null).ok,
    ).toBe(false);
    expect(
      verifyTotp(secret, phoneCode(secret, NOW + 60_000), NOW, null).ok,
    ).toBe(false);
  });

  it('never accepts a step that has already been used', () => {
    const secret = generateTotpSecret();
    const code = phoneCode(secret, NOW);
    expect(verifyTotp(secret, code, NOW, step(NOW)).ok).toBe(false);
    expect(verifyTotp(secret, code, NOW, step(NOW) + 1).ok).toBe(false);
    expect(verifyTotp(secret, code, NOW, step(NOW) - 1).ok).toBe(true);
  });

  it('flags a code valid one or two steps ago as clock drift', () => {
    const secret = generateTotpSecret();
    const twoAgo = verifyTotp(
      secret,
      phoneCode(secret, NOW - 60_000),
      NOW,
      null,
    );
    expect(twoAgo).toEqual({ ok: false, drift: true });
    // One step ago is inside the window, so it verifies, and is still drift: a
    // wrong password beside it is then recorded as a lagging clock too.
    const oneAgo = phoneCode(secret, NOW - 30_000);
    expect(verifyTotp(secret, oneAgo, NOW, null)).toEqual({
      ok: true,
      step: step(NOW) - 1,
      drift: true,
    });
    // A used-up step is not drift: a replay is not a clock fault.
    expect(verifyTotp(secret, oneAgo, NOW, step(NOW) - 1)).toEqual({
      ok: false,
      drift: false,
    });
  });

  it('does not flag a wrong code, or a malformed one, as drift', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, '000000', NOW, null).drift).toBe(false);
    expect(verifyTotp(secret, 'abcdef', NOW, null)).toEqual({
      ok: false,
      drift: false,
    });
    expect(verifyTotp(secret, '12345', NOW, null).ok).toBe(false);
  });
});
