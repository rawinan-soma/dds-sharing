import { Module } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import upstreamConfig from "../config/upstream.config.js";
import { UpstreamClient } from "./upstream-client.js";

export const UPSTREAM_CLIENT = Symbol("UPSTREAM_CLIENT");

/**
 * The single `UpstreamClient` instance for the process, built from validated
 * config (ADR 0018) — every caller shares it rather than each opening its
 * own, matching `UPSTREAM_CONCURRENCY = 1`'s point that upstream serialises
 * requests regardless of how many clients ask.
 */
@Module({
  providers: [
    {
      provide: UPSTREAM_CLIENT,
      useFactory: (config: ConfigType<typeof upstreamConfig>): UpstreamClient =>
        new UpstreamClient({ baseUrl: config.baseUrl, token: config.token }),
      inject: [upstreamConfig.KEY],
    },
  ],
  exports: [UPSTREAM_CLIENT],
})
export class UpstreamModule {}
