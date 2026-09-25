// Whatever arrived — an Extract archive or a bare CSV — down to the Extract
// bytes the fingerprint covers (ADR 0005: the CSV, never the zip).

import { DATA_DICTIONARY_FILENAME } from '../extraction/data-dictionary';
import { readZipEntries } from '../extraction/read-zip-entries';

export interface CandidateExtract {
  /** The entry's name inside the archive; null for a bare CSV. */
  name: string | null;
  bytes: Buffer;
}

export class NotAnExtractError extends Error {}

// A zip's local file header. A CSV cannot start with it: the Extract starts
// with a BOM, and a re-saved one with a column name.
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export async function extractsIn(file: Buffer): Promise<CandidateExtract[]> {
  if (!file.subarray(0, 4).equals(ZIP_MAGIC)) {
    return [{ name: null, bytes: file }];
  }
  let entries;
  try {
    entries = await readZipEntries(file);
  } catch (error) {
    throw new NotAnExtractError(
      `The file looks like a zip but cannot be read: ${(error as Error).message}`,
    );
  }
  // The Data dictionary is identical in every archive, so it says nothing
  // about which Request this was. Anything else is a candidate: a Requester
  // who re-zipped the folder may have renamed the Extract.
  const candidates = entries
    .filter((e) => !e.fileName.endsWith('/'))
    .filter((e) => e.fileName.split('/').pop() !== DATA_DICTIONARY_FILENAME)
    .map((e) => ({ name: e.fileName, bytes: e.content }));
  if (candidates.length === 0) {
    throw new NotAnExtractError(
      'The archive holds no Extract, only the Data dictionary.',
    );
  }
  return candidates;
}
