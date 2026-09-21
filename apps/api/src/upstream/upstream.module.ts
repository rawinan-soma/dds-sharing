import { Module } from '@nestjs/common';
import { UpstreamClient } from './upstream-client';
import { DEFAULT_BASE_URL } from './upstream.config';

@Module({
  providers: [
    {
      provide: UpstreamClient,
      useFactory: () => {
        const token = process.env.UPSTREAM_TOKEN;
        if (!token) {
          throw new Error('UPSTREAM_TOKEN is not set');
        }
        return new UpstreamClient({
          baseUrl: process.env.UPSTREAM_BASE_URL ?? DEFAULT_BASE_URL,
          token,
        });
      },
    },
  ],
  exports: [UpstreamClient],
})
export class UpstreamModule {}
