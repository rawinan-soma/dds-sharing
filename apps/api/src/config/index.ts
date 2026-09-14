import appConfig from "./app.config.js";
import dbConfig from "./db.config.js";
import redisConfig from "./redis.config.js";
import minioConfig from "./minio.config.js";
import smtpConfig from "./smtp.config.js";
import upstreamConfig from "./upstream.config.js";
import transportConfig from "./transport.config.js";

export { appConfig, dbConfig, redisConfig, minioConfig, smtpConfig, upstreamConfig, transportConfig };

/** Every namespaced factory the HTTP app loads (spec §11.2, ADR 0018). */
export const CONFIG_FACTORIES = [
  appConfig,
  dbConfig,
  redisConfig,
  minioConfig,
  smtpConfig,
  upstreamConfig,
  transportConfig,
];

export * from "./env-schema.js";
export type { AppConfig } from "./app.config.js";
export type { DbConfig } from "./db.config.js";
export type { RedisConfig } from "./redis.config.js";
export type { MinioConfig } from "./minio.config.js";
export type { SmtpConfig } from "./smtp.config.js";
export type { UpstreamConfig } from "./upstream.config.js";
export type { TransportConfig } from "./transport.config.js";
