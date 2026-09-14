import { registerAs } from "@nestjs/config";

export const REDIS_CONFIG_ENV_KEYS = ["REDIS_URL"] as const;

export interface RedisConfig {
  url: string;
}

export default registerAs(
  "redis",
  (): RedisConfig => ({
    url: process.env.REDIS_URL as string,
  }),
);
