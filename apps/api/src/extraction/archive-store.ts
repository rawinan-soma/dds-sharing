// Uploads the finished Extract archive to MinIO (spec §7.8): one `putObject`
// call, so "an object exists in the bucket" means exactly "a complete,
// publishable Extract" — the invariant the Download token and the lifecycle
// rule both rest on. No checksum covers this upload (spec §8.4) — a re-read
// before it would not cover it either.

import { Readable } from 'node:stream';
import { Client } from 'minio';

export interface ObjectRange {
  /** Inclusive byte offset. */
  start: number;
  /** Inclusive byte offset. */
  end: number;
}

export interface RangedObject {
  stream: Readable;
  /** The full object's size, regardless of what range was requested. */
  size: number;
  /** Set only when a range was actually requested and honoured. */
  range: ObjectRange | null;
}

export interface ArchiveStore {
  upload(objectKey: string, bytes: Buffer): Promise<void>;
  /** The object's size, or `null` if it does not exist (spec §9.5's "deleted object" state). */
  stat(objectKey: string): Promise<number | null>;
  /** `range` unset streams the whole object; set, it streams only that inclusive byte span (§9.1's range-request support). */
  download(objectKey: string, range?: ObjectRange): Promise<RangedObject>;
}

export function createMinioClient(config: {
  endpoint: string;
  port: number;
  useSsl: boolean;
  accessKey: string;
  secretKey: string;
}): Client {
  return new Client({
    endPoint: config.endpoint,
    port: config.port,
    useSSL: config.useSsl,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  });
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'NotFound'
  );
}

export function createMinioArchiveStore(
  client: Client,
  bucket: string,
): ArchiveStore {
  return {
    async upload(objectKey, bytes) {
      await client.putObject(bucket, objectKey, bytes, bytes.length, {
        'Content-Type': 'application/zip',
      });
    },

    async stat(objectKey) {
      try {
        const info = await client.statObject(bucket, objectKey);
        return info.size;
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    async download(objectKey, range) {
      const info = await client.statObject(bucket, objectKey);
      if (!range) {
        return {
          stream: await client.getObject(bucket, objectKey),
          size: info.size,
          range: null,
        };
      }
      const length = range.end - range.start + 1;
      return {
        stream: await client.getPartialObject(
          bucket,
          objectKey,
          range.start,
          length,
        ),
        size: info.size,
        range,
      };
    },
  };
}
