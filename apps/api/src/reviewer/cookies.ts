import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { type ReviewerConfig } from './reviewer-config';

export const SESSION_COOKIE = 'reviewer_session';
export const CSRF_COOKIE = 'reviewer_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      const value = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

const base = (config: ReviewerConfig): CookieOptions => ({
  path: '/',
  sameSite: 'lax',
  secure: config.secureCookies,
});

export function setSessionCookie(
  res: Response,
  config: ReviewerConfig,
  token: string,
  expires: Date,
) {
  // The ceiling bounds the cookie too; the server still enforces both windows.
  res.cookie(SESSION_COOKIE, token, {
    ...base(config),
    httpOnly: true,
    expires,
  });
}

export function clearSessionCookie(res: Response, config: ReviewerConfig) {
  res.clearCookie(SESSION_COOKIE, { ...base(config), httpOnly: true });
}

/** Double-submit token: readable by the page's script, by design. */
export function issueCsrfCookie(res: Response, config: ReviewerConfig): string {
  const token = randomBytes(32).toString('base64url');
  res.cookie(CSRF_COOKIE, token, { ...base(config), httpOnly: false });
  return token;
}

export function csrfTokensMatch(cookie: string, header: string): boolean {
  const a = Buffer.from(cookie);
  const b = Buffer.from(header);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
