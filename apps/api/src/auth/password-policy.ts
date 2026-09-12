import { randomInt } from "node:crypto";

// The one server-side place password rules live (spec §17.5, ticket #64) —
// the seeding CLI and the self-service change form both call this, so the
// rule can never drift between the two surfaces.
//
// The 20-character ceiling is deliberate, not an oversight (spec §17.5): it
// rules out passphrases and truncates what a password manager would
// generate, making the ceiling — not the floor — the binding constraint on
// strength. It was chosen knowingly with a TOTP second factor in place. Do
// not "fix" it without reopening that decision.
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 20;

export type PasswordPolicyViolation = "too_short" | "too_long" | "missing_uppercase" | "missing_digit" | "missing_special";

const UPPERCASE = /[A-Z]/;
const DIGIT = /[0-9]/;
const SPECIAL = /[^A-Za-z0-9]/;

export function checkPasswordPolicy(password: string): PasswordPolicyViolation[] {
  const violations: PasswordPolicyViolation[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) violations.push("too_short");
  if (password.length > PASSWORD_MAX_LENGTH) violations.push("too_long");
  if (!UPPERCASE.test(password)) violations.push("missing_uppercase");
  if (!DIGIT.test(password)) violations.push("missing_digit");
  if (!SPECIAL.test(password)) violations.push("missing_special");
  return violations;
}

export function isPasswordCompliant(password: string): boolean {
  return checkPasswordPolicy(password).length === 0;
}

const UPPERCASE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O — avoids look-alikes when read aloud on a call
const LOWERCASE_CHARS = "abcdefghijkmnpqrstuvwxyz";
const DIGIT_CHARS = "23456789";
const SPECIAL_CHARS = "!@#$%^&*-_=+";
const ALL_CHARS = UPPERCASE_CHARS + LOWERCASE_CHARS + DIGIT_CHARS + SPECIAL_CHARS;

function pick(chars: string): string {
  return chars[randomInt(chars.length)]!;
}

/** Generates a random password that satisfies {@link checkPasswordPolicy} by construction, for the CLI seeding ceremony. */
export function generateCompliantPassword(length = PASSWORD_MAX_LENGTH): string {
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    throw new Error(`password length must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH}`);
  }
  const required = [pick(UPPERCASE_CHARS), pick(DIGIT_CHARS), pick(SPECIAL_CHARS)];
  const rest = Array.from({ length: length - required.length }, () => pick(ALL_CHARS));
  const chars = [...required, ...rest];

  // Fisher-Yates, so the required characters aren't always in the first three positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}
