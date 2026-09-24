import { describe, expect, it } from 'vitest';
import { buildArchive } from '../extraction/extract-archive';
import { extractsIn, NotAnExtractError } from './extracts-in';

const csv = Buffer.from('﻿a,b\r\n1,2\r\n', 'utf-8');

describe('extractsIn', () => {
  it('takes a bare CSV as the Extract itself', async () => {
    expect(await extractsIn(csv)).toEqual([{ name: null, bytes: csv }]);
  });

  it('takes the Extract out of an Extract archive and leaves the Data dictionary', async () => {
    const zip = await buildArchive({ fileName: 'x.csv', bytes: csv });
    expect(await extractsIn(zip)).toEqual([{ name: 'x.csv', bytes: csv }]);
  });

  it('refuses an archive with no Extract in it', async () => {
    const zip = await buildArchive({
      fileName: 'data-dictionary.csv',
      bytes: csv,
    });
    await expect(extractsIn(zip)).rejects.toBeInstanceOf(NotAnExtractError);
  });

  it('refuses a zip it cannot read', async () => {
    const zip = await buildArchive({ fileName: 'x.csv', bytes: csv });
    await expect(extractsIn(zip.subarray(0, 40))).rejects.toBeInstanceOf(
      NotAnExtractError,
    );
  });
});
