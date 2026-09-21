import { randomInt } from 'node:crypto';
import * as argon2 from 'argon2';

// The one place the Reviewer password rules live (spec §17.5). The seeding CLI
// and the change form both call validatePassword; neither restates a rule.
//
// The 20-character ceiling is deliberate, not an oversight. It rules out
// passphrases and truncates what a password manager would generate, which
// makes the ceiling, not the floor, the binding constraint on strength. It was
// chosen knowingly with a TOTP second factor in place. Do not "fix" it without
// reopening the decision.
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 20;

export const PASSWORD_VIOLATIONS = [
  'too_short',
  'too_long',
  'no_uppercase',
  'no_digit',
  'no_special',
] as const;
export type PasswordViolation = (typeof PASSWORD_VIOLATIONS)[number];

/** Every violated rule, in a fixed order; empty when the password complies. */
export function validatePassword(password: string): PasswordViolation[] {
  const violations: PasswordViolation[] = [];
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) violations.push('too_short');
  if (length > PASSWORD_MAX_LENGTH) violations.push('too_long');
  if (!/\p{Lu}/u.test(password)) violations.push('no_uppercase');
  if (!/\d/.test(password)) violations.push('no_digit');
  if (!/[^\p{L}\p{N}]/u.test(password)) violations.push('no_special');
  return violations;
}

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '!@#$%^&*-_=+?';
const ALL = UPPER + LOWER + DIGITS + SPECIAL;
const GENERATED_LENGTH = 16;

const pick = (alphabet: string) => alphabet[randomInt(alphabet.length)];

/**
 * A random compliant password for the seeding ceremony. Ambiguous glyphs (0/O,
 * 1/l/I) are left out because the Reviewer reads it off a terminal once.
 */
export function generatePassword(): string {
  const chars = [pick(UPPER), pick(DIGITS), pick(SPECIAL)];
  while (chars.length < GENERATED_LENGTH) chars.push(pick(ALL));
  // Fisher-Yates, so the guaranteed classes are not always up front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
