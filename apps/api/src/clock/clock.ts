// Time is a seam: sessions, the throttle and TOTP all read it, and a test that
// must cross a 1-hour idle window or a 6-hour ceiling cannot wait for either.
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
