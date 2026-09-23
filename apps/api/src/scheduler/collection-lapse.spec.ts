import { describe, expect, it } from 'vitest';
import { collectionLapse } from './collection-lapse';

// 2026-09-21 is a Monday. Instants are written in ICT so the cases read the way
// §11.4 states them.
const ict = (local: string) => new Date(`${local}:00+07:00`);

describe('collectionLapse', () => {
  it('trips 24 wall-clock hours after a Monday Delivery and raises at once, inside business hours', () => {
    const lapse = collectionLapse(ict('2026-09-21T09:00'));
    expect(lapse.tripsAt).toEqual(ict('2026-09-22T09:00'));
    expect(lapse.raisesAt).toEqual(ict('2026-09-22T09:00'));
    expect(lapse.wallClockHoursElapsed).toBe(24);
  });

  it('holds a Friday-afternoon trip-wire for Monday 08:30, leaving 6.5 hours before the token expires', () => {
    const delivered = ict('2026-09-18T15:00');
    const lapse = collectionLapse(delivered);
    expect(lapse.tripsAt).toEqual(ict('2026-09-19T15:00'));
    expect(lapse.raisesAt).toEqual(ict('2026-09-21T08:30'));
    expect(lapse.wallClockHoursElapsed).toBe(65.5);
    const tokenExpiresAt = delivered.getTime() + 72 * 60 * 60 * 1000;
    expect((tokenExpiresAt - lapse.raisesAt.getTime()) / 3_600_000).toBe(6.5);
  });

  it('measures the silence in wall-clock hours, never business hours — a weekend does not stop it', () => {
    // 24 business hours from Friday 16:00 would land on Wednesday; the
    // trip-wire is Saturday 16:00 regardless.
    const lapse = collectionLapse(ict('2026-09-18T16:00'));
    expect(lapse.tripsAt).toEqual(ict('2026-09-19T16:00'));
    expect(lapse.raisesAt).toEqual(ict('2026-09-21T08:30'));
  });

  it('waits past the evening close for the next morning', () => {
    const lapse = collectionLapse(ict('2026-09-21T17:00'));
    expect(lapse.raisesAt).toEqual(ict('2026-09-23T08:30'));
    expect(lapse.wallClockHoursElapsed).toBe(39.5);
  });
});
