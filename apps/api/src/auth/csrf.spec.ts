import { describe, it, expect } from "vitest";
import { generateCsrfToken, csrfTokensMatch } from "./csrf.js";

describe("CSRF double-submit token (spec §17.5)", () => {
  it("generates a non-empty, non-repeating token", () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a.length).toBeGreaterThan(16);
    expect(a).not.toBe(b);
  });

  it("matches when the cookie and header carry the same value", () => {
    const token = generateCsrfToken();
    expect(csrfTokensMatch(token, token)).toBe(true);
  });

  it("rejects a missing header, a missing cookie, or a mismatch", () => {
    const token = generateCsrfToken();
    expect(csrfTokensMatch(token, undefined)).toBe(false);
    expect(csrfTokensMatch(undefined, token)).toBe(false);
    expect(csrfTokensMatch(token, generateCsrfToken())).toBe(false);
  });
});
