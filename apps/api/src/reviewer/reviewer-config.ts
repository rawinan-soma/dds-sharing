export const REVIEWER_CONFIG = Symbol('REVIEWER_CONFIG');

export interface ReviewerConfig {
  /** `Secure` on the Reviewer cookies. On unless explicitly switched off. */
  secureCookies: boolean;
}

/**
 * `Secure` is on by default and is switched off only by an explicit
 * development flag, exactly `REVIEWER_INSECURE_COOKIE=true`. There is no TLS
 * before production, so the insecure setting must be opted into: no other value
 * (unset, empty, `1`, `yes`, a typo) degrades it silently.
 */
export function reviewerConfigFromEnv(
  env: Record<string, string | undefined>,
): ReviewerConfig {
  return { secureCookies: env.REVIEWER_INSECURE_COOKIE !== 'true' };
}
