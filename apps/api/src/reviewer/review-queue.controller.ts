import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';
import { noteFrom, reviewerOf } from './decision-http';
import { Decisions, type DecisionOutcome } from './decisions.service';
import { ReviewerAuthGuard, type ReviewerRequest } from './reviewer-auth.guard';
import { ReviewQueue } from './review-queue.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Everything here is a user-initiated request, so it slides the idle window
// (§10.5) — which is why the page asks only when the Reviewer does, and never
// on a timer.
@Controller('reviewer/queue')
@UseGuards(CsrfGuard, ReviewerAuthGuard)
export class ReviewQueueController {
  constructor(
    private readonly queue: ReviewQueue,
    private readonly decisions: Decisions,
  ) {}

  @Get()
  list(@Req() req: ReviewerRequest) {
    return this.queue.list(reviewerOf(req).reviewerId);
  }

  @Get(':id')
  async dossier(@Param('id') id: string) {
    const dossier = UUID.test(id) ? await this.queue.dossier(id) : null;
    if (!dossier) throw new NotFoundException({ error: 'not_found' });
    return dossier;
  }

  // Approve or reject: the only two outcomes (§10.3). Both re-derive the
  // 24-business-hour expiry immediately before writing anything (§10.4), so a
  // Decision on a Request that expired while it sat open is refused, not
  // recorded.
  @Post(':id/approve')
  @HttpCode(200)
  async approve(@Param('id') id: string, @Req() req: ReviewerRequest) {
    if (!UUID.test(id)) throw new NotFoundException({ error: 'not_found' });
    const outcome = await this.decisions.approve(id, reviewerOf(req));
    return respond(outcome);
  }

  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: ReviewerRequest,
  ) {
    if (!UUID.test(id)) throw new NotFoundException({ error: 'not_found' });
    const note = noteFrom(body);
    const outcome = await this.decisions.reject(id, reviewerOf(req), note);
    return respond(outcome);
  }
}

function respond(outcome: DecisionOutcome) {
  switch (outcome.status) {
    case 'recorded':
      return { outcome: outcome.decision, decidedAt: outcome.decidedAt };
    case 'expired':
      throw new ConflictException({ error: 'expired' });
    case 'not_pending':
      throw new NotFoundException({ error: 'not_found' });
    case 'invalid_note':
      throw new BadRequestException({ error: 'invalid_note' });
  }
}
