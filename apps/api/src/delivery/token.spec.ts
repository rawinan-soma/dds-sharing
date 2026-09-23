import { describe, expect, it } from 'vitest';
import { generateToken, hashToken, tokenPrefix } from './token';

describe('generateToken', () => {
  it('generates an unguessable, URL-safe token with no two calls equal', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 random bytes, base64url-encoded with no padding.
    expect(a.length).toBe(43);
  });
});

describe('hashToken', () => {
  it('is deterministic and never equal to the raw token', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
  });

  it('hashes two different tokens to two different values', () => {
    expect(hashToken(generateToken())).not.toBe(hashToken(generateToken()));
  });
});

describe('tokenPrefix', () => {
  it('keeps only the first 8 characters', () => {
    expect(tokenPrefix('abcdefghijklmnop')).toBe('abcdefgh');
  });
});
