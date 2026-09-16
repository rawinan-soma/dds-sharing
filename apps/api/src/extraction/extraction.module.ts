import { Module } from "@nestjs/common";
import { UpstreamModule } from "../upstream/upstream.module.js";
import { MailModule } from "../mail/mail.module.js";
import { ExtractionQueueModule } from "./extraction-queue.module.js";
import { ExtractionQueueService } from "./extraction-queue.service.js";
import { ExtractionProcessor } from "./extraction.processor.js";
import { ExtractionReconcileService } from "./extraction-reconcile.service.js";

@Module({
  imports: [UpstreamModule, ExtractionQueueModule, MailModule],
  providers: [ExtractionQueueService, ExtractionProcessor, ExtractionReconcileService],
  exports: [ExtractionQueueService],
})
export class ExtractionModule {}
