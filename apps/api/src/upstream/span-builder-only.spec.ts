import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// The `+1` that turns an inclusive `to` into upstream's exclusive `end_date`
// lives in the span builder and nowhere else (spec §4.3, §7.2, §17.1). This is a
// tripwire, not a proof: it fails when date arithmetic appears in production
// code outside the one file allowed to hold it, so a second copy has to be
// argued for in review rather than slipping in.

const SRC = join(__dirname, '..');
const ALLOWED = join(__dirname, 'span-builder.ts');

const DATE_ARITHMETIC = [
  /86_?400_?000/,
  /24\s*\*\s*60\s*\*\s*60\s*\*\s*1_?000/,
  /\bset(UTC)?Date\s*\(/,
  /\bget(UTC)?Date\s*\(/,
  /\baddDays?\b/i,
  /\b(end|to)(Date)?\s*\+\s*1\b/i,
  /\bDate\.parse\b/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('the span builder is the only date arithmetic', () => {
  it('finds no day arithmetic in production code outside span-builder.ts', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => file !== ALLOWED)
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        return DATE_ARITHMETIC.some((pattern) => pattern.test(text));
      })
      .map((file) => relative(SRC, file));

    expect(offenders).toEqual([]);
  });

  it('still sees the arithmetic where it lives', () => {
    const text = readFileSync(ALLOWED, 'utf8');
    expect(DATE_ARITHMETIC.some((pattern) => pattern.test(text))).toBe(true);
  });
});
