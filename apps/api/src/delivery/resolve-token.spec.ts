import { describe, expect, it } from 'vitest';
import {
  ATTEMPT_CAP,
  type DownloadTokenRow,
  resolveArchiveAttempt,
  resolvePageLookup,
} from './resolve-token';

const now = new Date('2026-01-04T00:00:00Z');

const live = (overrides: Partial<DownloadTokenRow> = {}): DownloadTokenRow => ({
  id: 't1',
  requestId: 'r1',
  archiveFilename: 'REQ-2569-0001.zip',
  expiresAt: new Date('2026-01-04T12:00:00Z'),
  revokedAt: null,
  ...overrides,
});

describe('resolvePageLookup', () => {
  it('is unknown_token for no row', () => {
    expect(resolvePageLookup(null, now)).toBe('unknown_token');
  });

  it('is revoked when revokedAt is set, even if not yet expired', () => {
    expect(resolvePageLookup(live({ revokedAt: now }), now)).toBe('revoked');
  });

  it('is expired once expiresAt has passed', () => {
    const row = live({ expiresAt: new Date('2026-01-03T00:00:00Z') });
    expect(resolvePageLookup(row, now)).toBe('expired');
  });

  it('is success for a live, unrevoked, unexpired token', () => {
    expect(resolvePageLookup(live(), now)).toBe('success');
  });
});

describe('resolveArchiveAttempt', () => {
  it('is unknown_token for no row, regardless of attempt count', () => {
    expect(resolveArchiveAttempt(null, now, 0, true)).toBe('unknown_token');
  });

  it('is revoked before the cap or object are even checked', () => {
    const row = live({ revokedAt: now });
    expect(resolveArchiveAttempt(row, now, 0, true)).toBe('revoked');
  });

  it('is expired before the cap or object are even checked', () => {
    const row = live({ expiresAt: new Date('2026-01-03T00:00:00Z') });
    expect(resolveArchiveAttempt(row, now, 0, true)).toBe('expired');
  });

  it('succeeds under the cap with the object present', () => {
    expect(resolveArchiveAttempt(live(), now, ATTEMPT_CAP - 1, true)).toBe(
      'success',
    );
  });

  it('is attempts_exhausted at exactly the cap', () => {
    expect(resolveArchiveAttempt(live(), now, ATTEMPT_CAP, true)).toBe(
      'attempts_exhausted',
    );
  });

  it('stays attempts_exhausted well past the cap, never re-succeeding', () => {
    expect(resolveArchiveAttempt(live(), now, ATTEMPT_CAP + 50, true)).toBe(
      'attempts_exhausted',
    );
  });

  it('is object_missing when the token is live and under cap but the object is gone', () => {
    expect(resolveArchiveAttempt(live(), now, 0, false)).toBe('object_missing');
  });
});
