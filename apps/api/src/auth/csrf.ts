import { randomBytes, timingSafeEqual } from "node:crypto";

export const CSRF_HEADER = "x-csrf-token";

export function generateCsrfToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Double-submit check for every state-changing `/reviewer` POST (spec §17.5): the cookie value and the header the SPA echoes back must match, byte for byte. */
export function csrfTokensMatch(cookieValue: string | undefined, headerValue: string | undefined): boolean {
  if (!cookieValue || !headerValue) return false;
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(headerValue);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
