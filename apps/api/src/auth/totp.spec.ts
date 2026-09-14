import { describe, it, expect } from "vitest";
import * as OTPAuth from "otpauth";
import { generateTotpSecret, totpProvisioningUri, verifyTotpCode } from "./totp.js";

function codeAt(secret: OTPAuth.Secret, offsetSeconds: number): string {
  const totp = new OTPAuth.TOTP({
    issuer: "DDS Sharing",
    label: "reviewer1",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  return totp.generate({ timestamp: Date.now() + offsetSeconds * 1000 });
}

describe("TOTP enrolment and verification (spec §17.5, ⚠️ defaults-only)", () => {
  it("writes an enrolment URI using SHA-1, 6 digits and a 30-second period — never anything else", () => {
    const secret = generateTotpSecret();
    const uri = totpProvisioningUri("reviewer1", secret);
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });

  it("verifies a code generated with those same defaults — a non-default algorithm cannot ship silently", () => {
    const secret = generateTotpSecret();
    const code = codeAt(secret, 0);
    expect(verifyTotpCode(secret.base32, code)).toEqual({ outcome: "valid", step: expect.any(Number) });
  });

  it("accepts a code from one step in the past (±1 step window)", () => {
    const secret = generateTotpSecret();
    const code = codeAt(secret, -30);
    expect(verifyTotpCode(secret.base32, code).outcome).toBe("valid");
  });

  it("rejects a code from two steps in the past, but labels it as drift rather than a plain failure", () => {
    const secret = generateTotpSecret();
    const code = codeAt(secret, -60);
    expect(verifyTotpCode(secret.base32, code)).toEqual({ outcome: "drifted" });
  });

  it("rejects a code far outside any drift window as a plain invalid code", () => {
    const secret = generateTotpSecret();
    const code = codeAt(secret, -300);
    expect(verifyTotpCode(secret.base32, code)).toEqual({ outcome: "invalid" });
  });

  it("rejects a code already spent at or before the last used step, even inside the accept window", () => {
    const secret = generateTotpSecret();
    const code = codeAt(secret, 0);
    const first = verifyTotpCode(secret.base32, code);
    expect(first.outcome).toBe("valid");
    const lastUsedStep = first.outcome === "valid" ? first.step : NaN;

    expect(verifyTotpCode(secret.base32, code, lastUsedStep)).toEqual({ outcome: "invalid" });
  });

  it("rejects a garbage code", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret.base32, "000000")).toEqual({ outcome: "invalid" });
  });
});
