import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { CsrfGuard } from "../auth/csrf.guard.js";
import { SessionGuard, type AuthenticatedRequest } from "../auth/session.guard.js";
import { ReviewerQueueService } from "./reviewer-queue.service.js";
import type { QueueListResult } from "./reviewer-queue.types.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RejectBody {
  note: string;
}

interface AmendNoteBody {
  note: string;
}

// Read/decide (tickets #65, #66). Every route only ever extends the
// session because a Reviewer asked to see or do something; the queue is
// never polled (spec §10.5). The two Decision routes and the note
// amendment additionally require the CSRF double-submit token (§17.5) —
// each is a one-click, irreversible-in-effect release of case-level
// personal data or a permanent record correction.
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

  @UseGuards(CsrfGuard)
  @Post(":id/approve")
  async approve(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    if (!UUID_PATTERN.test(id)) throw new NotFoundException("not_pending");
    const outcome = await this.reviewerQueueService.approve(id, req.reviewerId, new Date());
    return this.respond(outcome);
  }

  @UseGuards(CsrfGuard)
  @Post(":id/reject")
  async reject(@Param("id") id: string, @Body() body: RejectBody, @Req() req: AuthenticatedRequest) {
    if (!UUID_PATTERN.test(id)) throw new NotFoundException("not_pending");
    const outcome = await this.reviewerQueueService.reject(id, req.reviewerId, body.note ?? "", new Date());
    return this.respond(outcome);
  }

  @UseGuards(CsrfGuard)
  @Patch(":id/rejection-note")
  async amendNote(@Param("id") id: string, @Body() body: AmendNoteBody, @Req() req: AuthenticatedRequest) {
    if (!UUID_PATTERN.test(id)) throw new NotFoundException("not_rejected");
    const outcome = await this.reviewerQueueService.amendNote(id, req.reviewerId, body.note ?? "", new Date());
    if (outcome.kind === "note_too_short") throw new ConflictException({ code: "note_too_short" });
    if (outcome.kind === "not_rejected") throw new ConflictException({ code: "not_rejected" });
    return { outcome: "amended" };
  }

  // Approve/reject share this shape. A genuinely unknown id is a 404, same
  // as the GET detail route above. Every other non-success outcome is "the
  // action did not happen", which is a 409 (the request exists but is no
  // longer in the state this action needs), never a 400 — the id was
  // well-formed and the Reviewer did nothing wrong except be slightly too
  // late, or too slow to type ten characters.
  private respond(outcome: Awaited<ReturnType<ReviewerQueueService["approve"]>>) {
    if (outcome.kind === "approved" || outcome.kind === "rejected") {
      return { outcome: outcome.kind, decidedAt: outcome.decidedAt };
    }
    if (outcome.kind === "not_found") {
      throw new NotFoundException("not_pending");
    }
    if (outcome.kind === "expired") {
      throw new ConflictException({ code: "expired", expiredAt: outcome.expiredAt });
    }
    throw new ConflictException({ code: outcome.kind });
  }
}
