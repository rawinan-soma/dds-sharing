import { describe, expect, it } from 'vitest';
import {
  generatePassword,
  hashPassword,
  validatePassword,
  verifyPassword,
} from './password-policy';

describe('password policy (§17.5)', () => {
  const compliant = 'Abcdefghij1!';

  it('accepts a password meeting every rule', () => {
    expect(validatePassword(compliant)).toEqual([]);
  });

  it.each([
    ['too short', 'Abcdefgh1!x', ['too_short']],
    ['too long', 'Abcdefghijklmnopqrs1!', ['too_long']],
    ['no uppercase', 'abcdefghij1!', ['no_uppercase']],
    ['no digit', 'Abcdefghijk!', ['no_digit']],
    ['no special', 'Abcdefghijk1', ['no_special']],
  ])('reports %s', (_name, password, violations) => {
    expect(validatePassword(password)).toEqual(violations);
  });

  it('accepts exactly 12 and exactly 20 characters', () => {
    expect(validatePassword('Abcdefghij1!')).toEqual([]);
    expect(validatePassword('Abcdefghijklmnopq1!!')).toEqual([]);
  });

  it('reports every violated rule at once, not just the first', () => {
    expect(validatePassword('abc')).toEqual([
      'too_short',
      'no_uppercase',
      'no_digit',
      'no_special',
    ]);
  });

  it('counts a space or any non-alphanumeric as special', () => {
    expect(validatePassword('Abcdefghij1 ')).toEqual([]);
  });

  it('generates a compliant password, and a different one each time', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const password = generatePassword();
      expect(validatePassword(password)).toEqual([]);
      seen.add(password);
    }
    expect(seen.size).toBe(200);
  });

  it('hashes with argon2id and verifies', async () => {
    const hash = await hashPassword(compliant);
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, compliant)).toBe(true);
    expect(await verifyPassword(hash, 'Abcdefghij1?')).toBe(false);
  });
});
