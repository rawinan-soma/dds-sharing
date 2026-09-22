import { Module } from '@nestjs/common';
import { ReferenceDataModule } from '../reference/reference-data.module';
import { UpstreamModule } from '../upstream/upstream.module';
import { ProbeService } from './probe.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [ReferenceDataModule, UpstreamModule],
  controllers: [RequestsController],
  providers: [RequestsService, ProbeService],
})
export class RequestsModule {}
