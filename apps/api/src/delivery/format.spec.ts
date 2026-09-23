import { describe, expect, it } from 'vitest';
import { formatBytes, formatHoursLeft } from './format';

describe('formatBytes', () => {
  it('renders whole bytes with no decimal', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('renders KB/MB/GB with one decimal place', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('formatHoursLeft', () => {
  it('rounds down to the hour', () => {
    expect(formatHoursLeft(2.9 * 60 * 60 * 1000)).toBe('2 hours');
  });

  it('uses the singular for exactly one hour', () => {
    expect(formatHoursLeft(60 * 60 * 1000)).toBe('1 hour');
  });

  it('floors a negative duration to 0 rather than reading as still live', () => {
    expect(formatHoursLeft(-1000)).toBe('0 hours');
  });
});
