import { ZipFile } from "yazl";

export interface ArchiveEntry {
  name: string;
  data: Buffer;
}

/**
 * Builds the Extract archive: exactly the Extract and the Data dictionary,
 * nothing else (spec §8.1, §8.3). `yazl` only (ADR 0009, ADR 0005) — the
 * archive is transport and deliberately **not** fingerprinted, so a
 * compressor's own defaults have nothing to break. No deterministic-zip
 * effort is spent here on purpose: that guarantee was considered and
 * declined for exactly this file.
 */
export function buildExtractArchive(entries: readonly [ArchiveEntry, ArchiveEntry]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new ZipFile();
    for (const entry of entries) {
      zip.addBuffer(entry.data, entry.name);
    }

    const chunks: Buffer[] = [];
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on("error", reject);
    zip.end();
  });
}
