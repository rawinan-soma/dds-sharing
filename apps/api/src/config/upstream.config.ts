import { registerAs } from "@nestjs/config";

export const UPSTREAM_CONFIG_ENV_KEYS = ["UPSTREAM_TOKEN", "UPSTREAM_BASE_URL"] as const;

export interface UpstreamConfig {
  token: string;
  baseUrl: string;
}

export default registerAs(
  "upstream",
  (): UpstreamConfig => ({
    token: process.env.UPSTREAM_TOKEN as string,
    baseUrl: process.env.UPSTREAM_BASE_URL as string,
  }),
);
