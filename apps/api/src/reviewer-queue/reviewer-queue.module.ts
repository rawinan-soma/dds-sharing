import { Module } from "@nestjs/common";
import { ReviewerModule } from "../auth/reviewer.module.js";
import { MailModule } from "../mail/mail.module.js";
import { ReviewerQueueController } from "./reviewer-queue.controller.js";
import { ReviewerQueueService } from "./reviewer-queue.service.js";

@Module({
  imports: [ReviewerModule, MailModule],
  controllers: [ReviewerQueueController],
  providers: [ReviewerQueueService],
})
export class ReviewerQueueModule {}
