// Test-only: reads back a zip's entries so a spec can assert on what
// `buildArchive`/`buildExtractArchive` actually produced, byte for byte.

import yauzl, { type Entry } from 'yauzl';

export interface ZipEntry {
  fileName: string;
  content: Buffer;
}

export function readZipEntries(zipBytes: Buffer): Promise<ZipEntry[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(zipBytes, { lazyEntries: true }, (openErr, zip) => {
      if (openErr || !zip) {
        reject(openErr ?? new Error('yauzl: failed to open the zip buffer'));
        return;
      }
      const entries: ZipEntry[] = [];
      zip.readEntry();
      zip.on('entry', (entry: Entry) => {
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) {
            reject(
              streamErr ??
                new Error(
                  `yauzl: failed to open a read stream for ${entry.fileName}`,
                ),
            );
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            entries.push({
              fileName: entry.fileName,
              content: Buffer.concat(chunks),
            });
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => resolve(entries));
      zip.on('error', reject);
    });
  });
}
