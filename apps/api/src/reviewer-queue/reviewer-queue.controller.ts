import { Controller, Get, NotFoundException, Param, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard.js";
import { ReviewerQueueService } from "./reviewer-queue.service.js";
import type { QueueListResult } from "./reviewer-queue.types.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Read-only (ticket #65) — approve and reject are #66's. Both routes only
// ever extend the session because a Reviewer asked to see something; the
// queue is never polled (spec §10.5), so a GET here always means a person
// pressed something.
@UseGuards(SessionGuard)
@Controller("reviewer/queue")
export class ReviewerQueueController {
  constructor(private readonly reviewerQueueService: ReviewerQueueService) {}

  @Get()
  async list(): Promise<QueueListResult> {
    const now = new Date();
    const requests = await this.reviewerQueueService.listPending(now);
    return { requests, refreshedAt: now.toISOString() };
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    // A malformed id can never resolve to a pending Request — reject it
    // before it reaches the database rather than surfacing a Postgres
    // "invalid input syntax for type uuid" as an unrelated 500.
    if (!UUID_PATTERN.test(id)) throw new NotFoundException("not_pending");

    const detail = await this.reviewerQueueService.getDetail(id, new Date());
    if (!detail) throw new NotFoundException("not_pending");
    return detail;
  }
}
