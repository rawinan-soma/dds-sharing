import * as m from '../../paraglide/messages.js';
import { countChanges, formatDuration, minutesSince } from './queue-format';

describe('formatDuration', () => {
  it('reads hours and minutes, the minutes padded to two digits', () => {
    expect(formatDuration(21 * 60 + 5)).toBe(
      m.reviewer_duration_hm({ hours: 21, minutes: '05' }),
    );
    expect(formatDuration(23 * 60 + 40)).toBe(
      m.reviewer_duration_hm({ hours: 23, minutes: '40' }),
    );
  });

  it('drops the hours when there are none', () => {
    expect(formatDuration(40)).toBe(m.reviewer_duration_m({ minutes: 40 }));
    expect(formatDuration(0)).toBe(m.reviewer_duration_m({ minutes: 0 }));
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
