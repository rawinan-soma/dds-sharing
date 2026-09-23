import { describe, expect, it } from 'vitest';
import { THAI_HOLIDAYS } from './thai-holidays';

describe('the Thai holiday config (§15.2)', () => {
  it('holds real, unique, ordered ICT calendar days', () => {
    for (const day of THAI_HOLIDAYS) {
      expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10)).toBe(day);
    }
    expect(new Set(THAI_HOLIDAYS).size).toBe(THAI_HOLIDAYS.length);
    expect([...THAI_HOLIDAYS].sort()).toEqual([...THAI_HOLIDAYS]);
  });
});
