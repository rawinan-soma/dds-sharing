import { registerAs } from "@nestjs/config";

export const MINIO_CONFIG_ENV_KEYS = [
  "MINIO_ENDPOINT",
  "MINIO_PORT",
  "MINIO_USE_SSL",
  "MINIO_ACCESS_KEY",
  "MINIO_SECRET_KEY",
  "MINIO_BUCKET",
] as const;

export interface MinioConfig {
  endpoint: string;
  port: number;
  useSsl: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

export default registerAs(
  "minio",
  (): MinioConfig => ({
    endpoint: process.env.MINIO_ENDPOINT as string,
    port: Number(process.env.MINIO_PORT),
    useSsl: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY as string,
    secretKey: process.env.MINIO_SECRET_KEY as string,
    bucket: process.env.MINIO_BUCKET as string,
  }),
);
