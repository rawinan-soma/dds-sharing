export const REVIEWER_CONFIG = Symbol('REVIEWER_CONFIG');

export interface ReviewerConfig {
  /** `Secure` on the Reviewer cookies. On unless the deployment has no TLS. */
  secureCookies: boolean;
}

/**
 * `Secure` is on unless `ALLOW_INSECURE_TRANSPORT` is exactly `true`. That flag
 * is validated at boot as strictly `true` or `false`, so no other value (unset
 * aside, which is `false`) can degrade it silently (§10.5).
 */
export function reviewerConfigFrom(transport: {
  allowInsecureTransport: boolean;
}): ReviewerConfig {
  return { secureCookies: !transport.allowInsecureTransport };
}
