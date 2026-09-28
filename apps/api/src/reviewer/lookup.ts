import { ATTEMPT_CAP } from '../delivery/resolve-token';

// Looking up a Request by its reference (spec §10.10). This is the pure part:
// what counts as a reference, and how a file's link reads now.

/**
 * Far longer than `REQ-2569-0142` will ever grow, and short enough that
 * nothing pasted into the field by mistake reaches the database.
 */
const MAX_REFERENCE_LENGTH = 32;

/**
 * The reference the Reviewer typed, or null when there is none. Exact
 * reference only: the surrounding spaces and the case are forgiven, because
 * neither is part of the reference, and nothing else is — never a prefix,
 * never a pattern, never another field (§10.2).
 */
export function referenceFrom(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const reference = input.trim().toUpperCase();
  if (reference === '' || reference.length > MAX_REFERENCE_LENGTH) return null;
  return reference;
}

/**
 * How a file's link reads now. A Re-run's revocation wins over a lapse
 * (ADR 0012): it is why the link stopped, whatever the clock says since.
 */
export type LinkState = 'live' | 'used_up' | 'expired' | 'revoked';

export function linkState(
  token: { expiresAt: Date; revokedAt: Date | null; attempts: number },
  now: Date,
): LinkState {
  if (token.revokedAt) return 'revoked';
  if (token.expiresAt <= now) return 'expired';
  if (token.attempts >= ATTEMPT_CAP) return 'used_up';
  return 'live';
}
