import { describe, expect, it } from 'vitest';
import { linkState, referenceFrom } from './lookup';

const NOW = new Date('2026-09-22T03:00:00Z');
const later = new Date(NOW.getTime() + 60_000);
const earlier = new Date(NOW.getTime() - 60_000);

// Looking up a Request by its reference (spec §10.10): exact reference only.
describe('referenceFrom', () => {
  it('takes a reference as it is quoted over the telephone', () => {
    expect(referenceFrom('REQ-2569-0142')).toBe('REQ-2569-0142');
  });

  it('forgives the surrounding spaces and the case, which are not the reference', () => {
    expect(referenceFrom('  req-2569-0142 ')).toBe('REQ-2569-0142');
  });

  it.each([
    ['nothing', undefined],
    ['an empty field', '   '],
    ['a list of them', ['REQ-2569-0142']],
    ['something too long to be a reference', `REQ-${'9'.repeat(64)}`],
  ])('finds nothing for %s', (_what, input) => {
    expect(referenceFrom(input)).toBeNull();
  });
});

// A file's link, as the record reads it now (spec §9.2, ADR 0012).
describe('linkState', () => {
  it('reads a link inside its 72 hours as live', () => {
    expect(
      linkState({ expiresAt: later, revokedAt: null, attempts: 1 }, NOW),
    ).toBe('live');
  });

  it('reads a lapsed link as expired', () => {
    expect(
      linkState({ expiresAt: earlier, revokedAt: null, attempts: 0 }, NOW),
    ).toBe('expired');
  });

  it('reads a link a Re-run replaced as revoked, even once it would have lapsed anyway', () => {
    expect(
      linkState({ expiresAt: earlier, revokedAt: earlier, attempts: 0 }, NOW),
    ).toBe('revoked');
  });

  it('reads a live link with every Attempt spent as used up', () => {
    expect(
      linkState({ expiresAt: later, revokedAt: null, attempts: 10 }, NOW),
    ).toBe('used_up');
  });
});
