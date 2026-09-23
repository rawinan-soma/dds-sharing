import { describe, expect, it } from 'vitest';
import {
  EXPIRY_BUSINESS_HOURS,
  addBusinessHours,
  businessHoursBetween,
  requestExpiry,
} from './business-hours';

// Mon–Fri 08:30–16:30 ICT (spec §15.2). Instants are written in ICT so the
// tests read the way the rule does; 2026-09-21 is a Monday.
const ict = (local: string) => new Date(`${local}:00+07:00`);

describe('businessHoursBetween', () => {
  it('counts the hours inside one working day', () => {
    expect(
      businessHoursBetween(ict('2026-09-21T09:00'), ict('2026-09-21T10:30')),
    ).toBe(1.5);
  });

  it('counts nothing outside the window', () => {
    expect(
      businessHoursBetween(ict('2026-09-21T16:30'), ict('2026-09-22T08:30')),
    ).toBe(0);
    expect(
      businessHoursBetween(ict('2026-09-21T05:00'), ict('2026-09-21T08:30')),
    ).toBe(0);
  });

  it('starts a 02:00 Sunday submit at 08:30 Monday', () => {
    expect(
      businessHoursBetween(ict('2026-09-20T02:00'), ict('2026-09-21T09:30')),
    ).toBe(1);
  });

  it('carries over a weekend', () => {
    // Fri 16:00 → 0.5 h, then Mon 08:30–09:30 → 1 h.
    expect(
      businessHoursBetween(ict('2026-09-18T16:00'), ict('2026-09-21T09:30')),
    ).toBe(1.5);
  });

  it('is zero when the range is empty or backwards', () => {
    const at = ict('2026-09-21T09:00');
    expect(businessHoursBetween(at, at)).toBe(0);
    expect(businessHoursBetween(ict('2026-09-21T10:00'), at)).toBe(0);
  });

  it('reads the ICT day, not the UTC one', () => {
    // 01:00 ICT Monday is Sunday 18:00 UTC: still before the window.
    expect(
      businessHoursBetween(
        new Date('2026-09-20T18:00:00Z'),
        ict('2026-09-21T09:30'),
      ),
    ).toBe(1);
  });
});

describe('addBusinessHours', () => {
  it('lands inside the same day when there is room', () => {
    expect(addBusinessHours(ict('2026-09-21T09:00'), 2)).toEqual(
      ict('2026-09-21T11:00'),
    );
  });

  it('rolls the remainder into the next working day', () => {
    // Fri 15:30 + 2 h: 1 h Friday, 1 h Monday from 08:30.
    expect(addBusinessHours(ict('2026-09-18T15:30'), 2)).toEqual(
      ict('2026-09-21T09:30'),
    );
  });

  it('ends a fully used day at its close, not at the next opening', () => {
    expect(addBusinessHours(ict('2026-09-21T08:30'), 8)).toEqual(
      ict('2026-09-21T16:30'),
    );
  });

  it('puts 24 business hours from a Sunday 02:00 at Wednesday close', () => {
    expect(
      addBusinessHours(ict('2026-09-20T02:00'), EXPIRY_BUSINESS_HOURS),
    ).toEqual(ict('2026-09-23T16:30'));
  });

  it('refuses an instant or a duration it cannot count, instead of scanning for ever', () => {
    expect(() => addBusinessHours(new Date(Number.NaN), 1)).toThrow();
    expect(() => addBusinessHours(ict('2026-09-21T09:00'), Infinity)).toThrow();
    expect(() =>
      addBusinessHours(ict('2026-09-21T09:00'), Number.NaN),
    ).toThrow();
  });

  it('inverts businessHoursBetween', () => {
    for (const start of [
      '2026-09-18T15:10',
      '2026-09-19T12:00',
      '2026-09-21T07:00',
      '2026-09-24T16:29',
    ]) {
      const from = ict(start);
      const to = addBusinessHours(from, 13.25);
      expect(businessHoursBetween(from, to)).toBeCloseTo(13.25, 9);
    }
  });
});

describe('requestExpiry (§10.4, §15.1)', () => {
  const submitted = ict('2026-09-21T09:00');

  it('is a predicate of the clock reading, with time left on the way down', () => {
    const fresh = requestExpiry(submitted, ict('2026-09-21T10:00'));
    expect(fresh).toMatchObject({ expired: false, hoursLeft: 23 });
  });

  it('is not actionable exactly at 24 business hours', () => {
    // 09:00 Mon + 24 h: 7.5 Mon, 8 Tue, 8 Wed, 0.5 Thu → Thu 09:00.
    const at = requestExpiry(submitted, ict('2026-09-24T09:00'));
    expect(at).toMatchObject({ expired: true, hoursLeft: 0 });
    const before = requestExpiry(submitted, ict('2026-09-24T08:59'));
    expect(before.expired).toBe(false);
  });

  it('does not count a weekend against the Request', () => {
    const friday = ict('2026-09-18T16:00');
    const monday = requestExpiry(friday, ict('2026-09-21T09:30'));
    expect(monday.expired).toBe(false);
    expect(monday.hoursLeft).toBeCloseTo(22.5, 9);
  });

  it('reports when it expires, on the same clock', () => {
    expect(requestExpiry(submitted, submitted).expiresAt).toEqual(
      ict('2026-09-24T09:00'),
    );
  });

  it('counts a public holiday as a working day: only weekends stop the clock (ADR 0021)', () => {
    // Songkran, Mon 13 – Wed 15 April 2026: a Request submitted that Monday
    // morning expires on the Thursday, as in any other week.
    const songkran = ict('2026-04-13T09:00');
    expect(requestExpiry(songkran, songkran).expiresAt).toEqual(
      ict('2026-04-16T09:00'),
    );
  });
});
