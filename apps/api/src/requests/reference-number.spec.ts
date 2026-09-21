import { describe, expect, it } from 'vitest';
import { formatReference } from './reference-number';

describe('formatReference', () => {
  it('has the shape REQ-<Buddhist year>-<counter, at least four digits>', () => {
    expect(formatReference(new Date('2026-09-21T03:00:00Z'), 142)).toBe(
      'REQ-2569-0142',
    );
  });

  it('does not truncate a counter past four digits', () => {
    expect(formatReference(new Date('2026-09-21T03:00:00Z'), 12345)).toBe(
      'REQ-2569-12345',
    );
  });

  it('reads the year in Bangkok, not UTC', () => {
    // 17:30 UTC on 31 Dec is already 1 Jan in Bangkok.
    expect(formatReference(new Date('2026-12-31T17:30:00Z'), 1)).toBe(
      'REQ-2570-0001',
    );
    expect(formatReference(new Date('2026-12-31T16:30:00Z'), 1)).toBe(
      'REQ-2569-0001',
    );
  });
});
