// Builds the Extract archive (spec §8.1): a zip holding the Extract and the
// Data dictionary. `yazl` is the one CSV-adjacent dependency this pipeline
// takes (ADR 0009) — the archive is transport and is deliberately never
// fingerprinted, so a compressor's defaults have nothing to break.

import { ZipFile } from 'yazl';
import {
  DATA_DICTIONARY_BYTES,
  DATA_DICTIONARY_FILENAME,
} from './data-dictionary';

export interface ArchiveEntry {
  fileName: string;
  bytes: Buffer;
}

export function buildArchive(extract: ArchiveEntry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new ZipFile();
    zip.addBuffer(extract.bytes, extract.fileName);
    zip.addBuffer(DATA_DICTIONARY_BYTES, DATA_DICTIONARY_FILENAME);

    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on('error', reject);
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.end();
  });
}
