import { describe, it, expect } from "vitest";
import { secureCookiesEnabled, reviewerSessionCookieOptions, reviewerCsrfCookieOptions } from "./cookie-options.js";

describe("reviewer cookie options (spec §17.5, ADR 0018)", () => {
  it("defaults to secure cookies when ALLOW_INSECURE_TRANSPORT is off", () => {
    expect(secureCookiesEnabled(false)).toBe(true);
  });

  it("is disabled only when ALLOW_INSECURE_TRANSPORT is on", () => {
    expect(secureCookiesEnabled(true)).toBe(false);
  });

  it("the session cookie is httpOnly, SameSite=Lax and secure by default", () => {
    const options = reviewerSessionCookieOptions(new Date(), false);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true });
  });

  it("the session cookie is not secure when ALLOW_INSECURE_TRANSPORT is on", () => {
    const options = reviewerSessionCookieOptions(new Date(), true);
    expect(options).toMatchObject({ secure: false });
  });

  it("the session cookie expires at the session's absolute ceiling", () => {
    const absoluteExpiresAt = new Date("2026-01-01T06:00:00Z");
    expect(reviewerSessionCookieOptions(absoluteExpiresAt, false).expires).toBe(absoluteExpiresAt);
  });

  it("the CSRF cookie is readable by the page (not httpOnly) but still SameSite=Lax and secure by default", () => {
    const options = reviewerCsrfCookieOptions(false);
    expect(options).toMatchObject({ httpOnly: false, sameSite: "lax", secure: true });
  });
});
