import { registerAs } from "@nestjs/config";

export const APP_CONFIG_ENV_KEYS = ["PORT"] as const;

export interface AppConfig {
  port: number;
}

export default registerAs(
  "app",
  (): AppConfig => ({
    port: Number(process.env.PORT),
  }),
);
