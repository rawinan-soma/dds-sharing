import { describe, expect, it } from 'vitest';
import { parseRange } from './range';

const SIZE = 1000;

describe('parseRange', () => {
  it('is null with no header — the caller serves the full object', () => {
    expect(parseRange(undefined, SIZE)).toBeNull();
  });

  it('is null for a non-bytes unit', () => {
    expect(parseRange('items=0-10', SIZE)).toBeNull();
  });

  it('parses an explicit start-end range', () => {
    expect(parseRange('bytes=100-199', SIZE)).toEqual({ start: 100, end: 199 });
  });

  it('parses an open-ended range as start to the last byte — the resume case', () => {
    expect(parseRange('bytes=800-', SIZE)).toEqual({ start: 800, end: 999 });
  });

  it('parses a suffix range as the last N bytes', () => {
    expect(parseRange('bytes=-100', SIZE)).toEqual({ start: 900, end: 999 });
  });

  it('clamps an end past the object size to the last byte', () => {
    expect(parseRange('bytes=900-5000', SIZE)).toEqual({
      start: 900,
      end: 999,
    });
  });

  it('is null for a start at or past the object size', () => {
    expect(parseRange('bytes=1000-', SIZE)).toBeNull();
  });

  it('is null for an inverted range', () => {
    expect(parseRange('bytes=500-100', SIZE)).toBeNull();
  });

  it('is null for a malformed header', () => {
    expect(parseRange('bytes=abc-def', SIZE)).toBeNull();
  });
});
