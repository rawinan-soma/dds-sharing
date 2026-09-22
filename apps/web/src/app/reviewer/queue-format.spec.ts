import { countChanges, formatDuration, minutesSince } from './queue-format';

describe('formatDuration', () => {
  it('reads hours and minutes as N h NN m', () => {
    expect(formatDuration(21 * 60 + 5)).toBe('21 h 05 m');
    expect(formatDuration(23 * 60 + 40)).toBe('23 h 40 m');
  });

  it('drops the hours when there are none', () => {
    expect(formatDuration(40)).toBe('40 m');
    expect(formatDuration(0)).toBe('0 m');
  });
});

describe('countChanges', () => {
  const row = (id: string) => ({ id });

  it('counts Requests that arrived and Requests that left', () => {
    expect(
      countChanges([row('a'), row('b')], [row('b'), row('c'), row('d')]),
    ).toBe(3);
  });

  it('is zero when nothing moved, whatever the order', () => {
    expect(countChanges([row('a'), row('b')], [row('b'), row('a')])).toBe(0);
  });
});

describe('minutesSince', () => {
  it('rounds down to whole minutes and never goes negative', () => {
    expect(minutesSince(0, 179_000)).toBe(2);
    expect(minutesSince(60_000, 0)).toBe(0);
  });
});
