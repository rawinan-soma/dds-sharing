import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// The `+1` that turns an inclusive `to` into upstream's exclusive `end_date`
// lives in the span builder and nowhere else (spec §4.3, §7.2, §17.1). This is a
// tripwire, not a proof: it fails when date arithmetic appears in production
// code outside the one file allowed to hold it, so a second copy has to be
// argued for in review rather than slipping in.

// The API's source and the SPA's: a stray `+1` is likelier in the UI.
const ROOTS = [join(__dirname, '..'), join(__dirname, '../../../web/src')];
const SPAN_BUILDER = join(__dirname, 'span-builder.ts');
// The picker's 365-day cap (§4.2) is arithmetic on the difference of two human
// dates, not the `+1`: it needs `from + 365 days` to grey out `to`. It lives in
// one file of its own, and the API's copy of the same rule is `daysBetween` in
// the span builder above. This is the second file the tripwire allows, argued
// for here so a third has to be argued for too.
const SPAN_CAP = join(__dirname, '../../../web/src/app/requester/span-cap.ts');
const ALLOWED = [SPAN_BUILDER, SPAN_CAP];

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
    const offenders = ROOTS.flatMap(sourceFiles)
      .filter((file) => !ALLOWED.includes(file))
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        return DATE_ARITHMETIC.some((pattern) => pattern.test(text));
      })
      .map((file) => relative(join(__dirname, '../../../..'), file));

    expect(offenders).toEqual([]);
  });

  it('still sees the arithmetic where it lives', () => {
    for (const file of ALLOWED) {
      const text = readFileSync(file, 'utf8');
      expect(DATE_ARITHMETIC.some((pattern) => pattern.test(text))).toBe(true);
    }
  });
});
