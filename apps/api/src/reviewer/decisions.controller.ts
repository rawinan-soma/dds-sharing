import {
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';
import { noteFrom, reviewerOf } from './decision-http';
import { type AmendOutcome, Decisions } from './decisions.service';
import { ReviewerAuthGuard, type ReviewerRequest } from './reviewer-auth.guard';

// A mistyped internal note is corrected by a new event citing the one it
// corrects, never by an edit (§12.2) — there is no route to change the
// original, only to cite it.
@Controller('reviewer/decisions')
@UseGuards(CsrfGuard, ReviewerAuthGuard)
export class DecisionsController {
  constructor(private readonly decisions: Decisions) {}

  @Post(':eventId/amend-note')
  @HttpCode(204)
  async amendNote(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() body: unknown,
    @Req() req: ReviewerRequest,
  ) {
    const outcome = await this.decisions.amendNote(
      eventId,
      reviewerOf(req),
      noteFrom(body),
    );
    respond(outcome);
  }
}

function respond(outcome: AmendOutcome): void {
  switch (outcome.status) {
    case 'amended':
      return;
    case 'not_found':
      throw new NotFoundException({ error: 'not_found' });
    case 'invalid_note':
      throw new UnprocessableEntityException({ error: 'invalid_note' });
  }
}
