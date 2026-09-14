import type { CookieOptions } from "express";

export const REVIEWER_SESSION_COOKIE = "reviewer_session";
export const REVIEWER_CSRF_COOKIE = "reviewer_csrf";

/**
 * `httpOnly`, `SameSite=Lax`, and `Secure` on by default (spec §17.5) —
 * disabled only by `ALLOW_INSECURE_TRANSPORT` (ADR 0018), never by silent
 * degradation, because there is no TLS before production. The flag is the
 * caller's job to source from the `transport` config namespace — this
 * module never reads the environment itself.
 */
export function secureCookiesEnabled(allowInsecureTransport: boolean): boolean {
  return !allowInsecureTransport;
}

export function reviewerSessionCookieOptions(
  absoluteExpiresAt: Date,
  allowInsecureTransport: boolean,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookiesEnabled(allowInsecureTransport),
    path: "/",
    expires: absoluteExpiresAt,
  };
}

/** The CSRF cookie must be readable by the SPA (it echoes the value back as a header), so it is the one reviewer cookie that is not `httpOnly`. */
export function reviewerCsrfCookieOptions(allowInsecureTransport: boolean): CookieOptions {
  return {
    httpOnly: false,
    sameSite: "lax",
    secure: secureCookiesEnabled(allowInsecureTransport),
    path: "/",
  };
}
