import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { ReferenceDataModule } from '../reference/reference-data.module';
import { UpstreamModule } from '../upstream/upstream.module';
import { ProbeService } from './probe.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [ReferenceDataModule, UpstreamModule, MailModule],
  controllers: [RequestsController],
  providers: [RequestsService, ProbeService],
})
export class RequestsModule {}
