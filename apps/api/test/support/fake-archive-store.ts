import { Readable } from 'node:stream';
import {
  type ArchiveStore,
  type ObjectRange,
} from '../../src/extraction/archive-store';

/** An in-memory `ArchiveStore` for tests that don't run a real MinIO — `upload`
 * genuinely feeds `stat`/`download`, so the e2e range-request and
 * deleted-object paths are exercisable without one. */
export function fakeArchiveStore(): ArchiveStore & {
  uploads: { objectKey: string; bytes: Buffer }[];
  bucketPreparations: number;
} {
  const objects = new Map<string, Buffer>();
  const uploads: { objectKey: string; bytes: Buffer }[] = [];

  return {
    uploads,
    bucketPreparations: 0,
    prepareBucket() {
      this.bucketPreparations += 1;
      return Promise.resolve();
    },
    upload(objectKey, bytes) {
      objects.set(objectKey, bytes);
      uploads.push({ objectKey, bytes });
      return Promise.resolve();
    },
    stat(objectKey) {
      const bytes = objects.get(objectKey);
      return Promise.resolve(bytes ? bytes.length : null);
    },
    download(objectKey, range?: ObjectRange) {
      const bytes = objects.get(objectKey);
      if (!bytes)
        return Promise.reject(new Error(`no such object: ${objectKey}`));
      const slice = range ? bytes.subarray(range.start, range.end + 1) : bytes;
      return Promise.resolve({
        stream: Readable.from(slice),
        size: bytes.length,
        range: range ?? null,
      });
    },
    remove(objectKey) {
      objects.delete(objectKey);
      return Promise.resolve();
    },
  };
}
