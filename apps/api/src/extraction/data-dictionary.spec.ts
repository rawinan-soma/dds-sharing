import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DATA_DICTIONARY_BYTES,
  DATA_DICTIONARY_CHECKSUM,
  DATA_DICTIONARY_FILENAME,
} from './data-dictionary';

describe('the Data dictionary build artefact', () => {
  it('carries a fixed filename', () => {
    expect(DATA_DICTIONARY_FILENAME).toBe('data-dictionary.csv');
  });

  it('begins with the UTF-8 BOM and uses CRLF, matching the Extract writer', () => {
    expect([...DATA_DICTIONARY_BYTES.subarray(0, 3)]).toEqual([
      0xef, 0xbb, 0xbf,
    ]);
    expect(DATA_DICTIONARY_BYTES.toString('utf-8')).toContain('\r\n');
  });

  it('notes the BOM for pandas readers', () => {
    expect(DATA_DICTIONARY_BYTES.toString('utf-8')).toContain(
      "encoding='utf-8-sig'",
    );
  });

  it('carries the Disease group classification', () => {
    const text = DATA_DICTIONARY_BYTES.toString('utf-8');
    expect(text).toContain('Disease group classification');
    expect(text).toContain('air-pollution');
    expect(text).toContain('silicosis');
  });

  it('the checksum matches the shipped bytes exactly', () => {
    expect(DATA_DICTIONARY_CHECKSUM).toBe(
      createHash('sha256').update(DATA_DICTIONARY_BYTES).digest('hex'),
    );
  });
});
