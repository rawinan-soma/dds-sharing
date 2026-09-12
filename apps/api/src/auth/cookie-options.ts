import type { CookieOptions } from "express";

export const REVIEWER_SESSION_COOKIE = "reviewer_session";
export const REVIEWER_CSRF_COOKIE = "reviewer_csrf";

/**
 * `httpOnly`, `SameSite=Lax`, and `Secure` on by default (spec §17.5) —
 * disabled only by an explicit development flag, never by silent
 * degradation, because there is no TLS before production.
 */
export function secureCookiesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.REVIEWER_INSECURE_COOKIES !== "true";
}

export function reviewerSessionCookieOptions(absoluteExpiresAt: Date, env?: NodeJS.ProcessEnv): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookiesEnabled(env),
    path: "/",
    expires: absoluteExpiresAt,
  };
}

/** The CSRF cookie must be readable by the SPA (it echoes the value back as a header), so it is the one reviewer cookie that is not `httpOnly`. */
export function reviewerCsrfCookieOptions(env?: NodeJS.ProcessEnv): CookieOptions {
  return {
    httpOnly: false,
    sameSite: "lax",
    secure: secureCookiesEnabled(env),
    path: "/",
  };
}
