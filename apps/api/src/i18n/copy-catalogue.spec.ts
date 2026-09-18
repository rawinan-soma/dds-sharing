import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(here, '../../../../messages');

const en = JSON.parse(
  readFileSync(join(messagesDir, 'en.json'), 'utf-8'),
) as Record<string, unknown>;
const th = JSON.parse(
  readFileSync(join(messagesDir, 'th.json'), 'utf-8'),
) as Record<string, unknown>;

const THAI_CHAR = /[฀-๿]/;

// §17.1's checked-in exemption list: values that are legitimately not Thai
// even in the Thai catalogue (telephone number, DDS, email addresses).
const EXEMPT_VALUE_PATTERNS = [
  /^[\d\s()+-]+$/,
  /^DDS$/,
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
];

function isExempt(value: string): boolean {
  return EXEMPT_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

describe('copy catalogue (§17.1)', () => {
  it('keeps identical key sets between en.json and th.json', () => {
    const enKeys = Object.keys(en)
      .filter((key) => key !== '$schema')
      .sort();
    const thKeys = Object.keys(th)
      .filter((key) => key !== '$schema')
      .sort();

    expect(thKeys).toEqual(enKeys);
  });

  it('translates every th.json value into Thai, except the checked-in exemptions', () => {
    const untranslated = Object.entries(th)
      .filter(([key]) => key !== '$schema')
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      )
      .filter(([, value]) => !THAI_CHAR.test(value))
      .filter(([, value]) => !isExempt(value));

    expect(untranslated).toEqual([]);
  });
});
