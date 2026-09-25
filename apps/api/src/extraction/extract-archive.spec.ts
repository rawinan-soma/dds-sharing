import { describe, expect, it } from 'vitest';
import { buildArchive } from './extract-archive';
import {
  DATA_DICTIONARY_BYTES,
  DATA_DICTIONARY_FILENAME,
} from './data-dictionary';
import { readZipEntries as readEntries } from './read-zip-entries';

describe('buildArchive', () => {
  it('carries exactly the Extract and the Data dictionary, byte for byte', async () => {
    const csvBytes = Buffer.from('a,b,c\r\n1,2,3\r\n', 'utf-8');
    const zipBytes = await buildArchive({
      fileName: 'dds-envocc-sharing-20260114-170503.csv',
      bytes: csvBytes,
    });

    const entries = await readEntries(zipBytes);
    expect(entries.map((e) => e.fileName).toSorted()).toEqual(
      [
        DATA_DICTIONARY_FILENAME,
        'dds-envocc-sharing-20260114-170503.csv',
      ].toSorted(),
    );

    const csvEntry = entries.find(
      (e) => e.fileName === 'dds-envocc-sharing-20260114-170503.csv',
    )!;
    expect(csvEntry.content.equals(csvBytes)).toBe(true);

    const dictEntry = entries.find(
      (e) => e.fileName === DATA_DICTIONARY_FILENAME,
    )!;
    expect(dictEntry.content.equals(DATA_DICTIONARY_BYTES)).toBe(true);
  });
});
