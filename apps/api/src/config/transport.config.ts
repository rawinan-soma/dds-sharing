import { registerAs } from "@nestjs/config";

export const TRANSPORT_CONFIG_ENV_KEYS = ["FRONTEND_URL", "ALLOW_INSECURE_TRANSPORT"] as const;

export interface TransportConfig {
  frontendUrl: string;
  /** ADR 0018: one flag for one fact — this deployment has no TLS. */
  allowInsecureTransport: boolean;
}

export default registerAs(
  "transport",
  (): TransportConfig => ({
    frontendUrl: process.env.FRONTEND_URL as string,
    allowInsecureTransport: process.env.ALLOW_INSECURE_TRANSPORT === "true",
  }),
);
