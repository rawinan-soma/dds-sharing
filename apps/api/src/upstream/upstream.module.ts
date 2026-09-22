import { Module } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { upstreamConfig } from '../config/namespaces';
import { UpstreamClient } from './upstream-client';

@Module({
  providers: [
    {
      provide: UpstreamClient,
      inject: [upstreamConfig.KEY],
      useFactory: (upstream: ConfigType<typeof upstreamConfig>) =>
        new UpstreamClient({
          baseUrl: upstream.baseUrl,
          token: upstream.token,
        }),
    },
  ],
  exports: [UpstreamClient],
})
export class UpstreamModule {}
