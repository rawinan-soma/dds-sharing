import { describe, it, expect } from "vitest";
import { secureCookiesEnabled, reviewerSessionCookieOptions, reviewerCsrfCookieOptions } from "./cookie-options.js";

describe("reviewer cookie options (spec §17.5)", () => {
  it("defaults to secure cookies when no development flag is set", () => {
    expect(secureCookiesEnabled({})).toBe(true);
  });

  it("is disabled only by the explicit development flag, not by any other value", () => {
    expect(secureCookiesEnabled({ REVIEWER_INSECURE_COOKIES: "true" })).toBe(false);
    expect(secureCookiesEnabled({ REVIEWER_INSECURE_COOKIES: "1" })).toBe(true);
    expect(secureCookiesEnabled({ REVIEWER_INSECURE_COOKIES: "false" })).toBe(true);
  });

  it("the session cookie is httpOnly, SameSite=Lax and secure by default", () => {
    const options = reviewerSessionCookieOptions(new Date(), {});
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true });
  });

  it("the session cookie expires at the session's absolute ceiling", () => {
    const absoluteExpiresAt = new Date("2026-01-01T06:00:00Z");
    expect(reviewerSessionCookieOptions(absoluteExpiresAt, {}).expires).toBe(absoluteExpiresAt);
  });

  it("the CSRF cookie is readable by the page (not httpOnly) but still SameSite=Lax and secure by default", () => {
    const options = reviewerCsrfCookieOptions({});
    expect(options).toMatchObject({ httpOnly: false, sameSite: "lax", secure: true });
  });
});
