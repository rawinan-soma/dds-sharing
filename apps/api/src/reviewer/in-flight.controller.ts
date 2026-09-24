import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';
import { reviewerOf } from './decision-http';
import { InFlight } from './in-flight.service';
import { ReviewerAuthGuard, type ReviewerRequest } from './reviewer-auth.guard';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What a Reviewer can do to an approved Request (§10.7, §10.8, §10.9). Any
// active Reviewer may act on any of them: the approver's name is
// accountability, not permission.
@Controller('reviewer')
@UseGuards(CsrfGuard, ReviewerAuthGuard)
export class InFlightController {
  constructor(private readonly inFlight: InFlight) {}

  // The list itself arrives with the queue's, in one read.
  @Get('in-flight/:id')
  async detail(@Param('id') id: string) {
    const detail = UUID.test(id) ? await this.inFlight.detail(id) : null;
    if (!detail) throw new NotFoundException({ error: 'not_found' });
    return detail;
  }

  @Post('requests/:id/rerun')
  @HttpCode(200)
  async rerun(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: ReviewerRequest,
  ) {
    if (!UUID.test(id)) throw new NotFoundException({ error: 'not_found' });
    nothingIn(body);
    const outcome = await this.inFlight.rerun(id, reviewerOf(req).reviewerId);
    switch (outcome.status) {
      case 'queued':
        return { queuedAt: outcome.queuedAt };
      case 'not_in_flight':
        throw new NotFoundException({ error: 'not_found' });
      case 'not_possible':
        throw new ConflictException({ error: 'extracting' });
    }
  }

  @Post('requests/:id/resend')
  @HttpCode(200)
  async resend(@Param('id') id: string, @Body() body: unknown) {
    if (!UUID.test(id)) throw new NotFoundException({ error: 'not_found' });
    nothingIn(body);
    const outcome = await this.inFlight.resend(id);
    switch (outcome.status) {
      case 'sent':
        return { sentAt: outcome.sentAt };
      case 'not_in_flight':
        throw new NotFoundException({ error: 'not_found' });
      case 'not_possible':
        throw new ConflictException({ error: 'nothing_to_resend' });
      case 'unavailable':
        throw new ConflictException({ error: 'resend_unavailable' });
    }
  }
}

/**
 * Neither action takes anything: a Re-run refetches what was approved, and a
 * resend goes to the address on the Request or nowhere (ADR 0017). A field is
 * refused rather than ignored, so nobody mistakes a dropped one for a kept one.
 */
function nothingIn(body: unknown): void {
  if (Object.keys(body ?? {}).length > 0) {
    throw new BadRequestException({ error: 'bad_request' });
  }
}
