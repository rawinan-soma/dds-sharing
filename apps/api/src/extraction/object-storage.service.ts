import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import type { Client } from "minio";
import minioConfig from "../config/minio.config.js";
import { MINIO_CLIENT } from "./object-storage.tokens.js";

/**
 * MinIO access for the Extract archive (spec §7.9 step 7, §9.5). The bucket
 * is ensured once at startup — nothing else in this repo provisions it —
 * so an operator standing up a fresh MinIO does not also have to run a
 * bucket-creation step by hand.
 */
@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageService.name);

  constructor(
    @Inject(MINIO_CLIENT) private readonly client: Client,
    @Inject(minioConfig.KEY) private readonly config: ConfigType<typeof minioConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    const exists = await this.client.bucketExists(this.config.bucket);
    if (!exists) {
      await this.client.makeBucket(this.config.bucket);
      this.logger.log(`Created MinIO bucket "${this.config.bucket}".`);
    }
  }

  /**
   * spec §7.9 step 7: the finished archive lands in MinIO in exactly **one**
   * operation, so *"an object exists in the bucket"* means exactly *"a
   * complete, publishable Extract archive"*. No checksum covers this upload
   * (spec §8.4) — that is an accepted, recorded gap, not an oversight.
   */
  async uploadArchive(objectKey: string, data: Buffer): Promise<void> {
    await this.client.putObject(this.config.bucket, objectKey, data, data.length);
  }
}
