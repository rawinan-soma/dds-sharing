/** What every `/health` component reports (spec §14.1). The reason is a
 * fixed phrase: the document is unauthenticated, so statuses only. */
export type PassFailHealth =
  { status: 'ok' } | { status: 'degraded'; reason: string };

/** `warn` is the disk's 75% mark (§13.5): reported, never non-200. */
export type ComponentHealth =
  PassFailHealth | { status: 'warn'; reason: string };
