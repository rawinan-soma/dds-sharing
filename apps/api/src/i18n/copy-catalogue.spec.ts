import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { catalogue, interpolate, loadCatalogue } from './copy-catalogue';

const here = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(here, '../../../../messages');
const fixtureRoot = join(here, '../../test/fixtures/catalogue');

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

describe('interpolate', () => {
  it('substitutes every {placeholder} present in params', () => {
    expect(
      interpolate('Hello {name}, ref {reference}', {
        name: 'Somchai',
        reference: 'REQ-2569-0001',
      }),
    ).toBe('Hello Somchai, ref REQ-2569-0001');
  });

  it('leaves an unmatched placeholder untouched rather than throwing', () => {
    expect(interpolate('Hello {name}', {})).toBe('Hello {name}');
  });

  it('passes a template with no placeholders through unchanged', () => {
    expect(interpolate('No params here')).toBe('No params here');
  });
});

describe('loadCatalogue', () => {
  it('reads the locale named by project.inlang/settings.json baseLocale', () => {
    const en2 = loadCatalogue(fixtureRoot);
    expect(en2.locale).toBe('en');
    expect(en2.t('greeting', { name: 'Somchai' })).toBe('Hello Somchai');
  });

  it('throws on a key absent from the catalogue, naming the key', () => {
    const cat = loadCatalogue(fixtureRoot);
    expect(() => cat.t('does_not_exist')).toThrow(/does_not_exist/);
  });

  it("the app's own catalogue resolves against the real repo files", () => {
    // Today's baseLocale is "en" (ADR 0010; the flip to Thai is #96), so this
    // also proves the reader tracks project.inlang/settings.json rather than
    // hardcoding a language.
    expect(catalogue.locale).toBe('en');
    expect(catalogue.t('app_telephone')).toBe(en.app_telephone);
  });
});
