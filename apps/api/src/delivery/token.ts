import { randomBytes, createHash } from 'node:crypto';

// The Download token (spec §9.2): 256 bits, unguessable. Only its SHA-256
// hash is ever stored — mirrors `reviewer_session.token_hash` — so a database
// read alone never yields a working credential. The audit trail keeps the
// presented token's first 8 characters only (never the full token, §12.3).

const TOKEN_BYTES = 32;
export const TOKEN_PREFIX_LENGTH = 8;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenPrefix(token: string): string {
  return token.slice(0, TOKEN_PREFIX_LENGTH);
}
