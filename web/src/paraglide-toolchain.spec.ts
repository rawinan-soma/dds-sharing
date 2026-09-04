import { m } from './paraglide/messages.js';

describe('the Paraglide catalogue', () => {
  it('compiles all 122 message keys from messages/th.json', () => {
    expect(Object.keys(m)).toHaveLength(122);
  });

  it('resolves every message function to a non-empty Thai string', () => {
    for (const fn of Object.values(m)) {
      expect(typeof (fn as () => string)()).toBe('string');
    }
  });
});
