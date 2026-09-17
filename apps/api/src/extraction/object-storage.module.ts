import { Module } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { Client } from "minio";
import minioConfig from "../config/minio.config.js";
import { MINIO_CLIENT } from "./object-storage.tokens.js";
import { ObjectStorageService } from "./object-storage.service.js";

export { MINIO_CLIENT };

/**
 * The single MinIO client for the process, built from validated config
 * (ADR 0018) — mirrors `UpstreamModule`'s one-instance-per-process shape.
 */
@Module({
  providers: [
    {
      provide: MINIO_CLIENT,
      useFactory: (config: ConfigType<typeof minioConfig>): Client =>
        new Client({
          endPoint: config.endpoint,
          port: config.port,
          useSSL: config.useSsl,
          accessKey: config.accessKey,
          secretKey: config.secretKey,
        }),
      inject: [minioConfig.KEY],
    },
    ObjectStorageService,
  ],
  exports: [ObjectStorageService],
})
export class ObjectStorageModule {}
