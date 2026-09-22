// Uploads the finished Extract archive to MinIO (spec §7.8): one `putObject`
// call, so "an object exists in the bucket" means exactly "a complete,
// publishable Extract" — the invariant the Download token and the lifecycle
// rule both rest on. No checksum covers this upload (spec §8.4) — a re-read
// before it would not cover it either.

import { Client } from 'minio';

export interface ArchiveStore {
  upload(objectKey: string, bytes: Buffer): Promise<void>;
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
  };
}
