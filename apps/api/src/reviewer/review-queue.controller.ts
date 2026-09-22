import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';
import { ReviewerAuthGuard } from './reviewer-auth.guard';
import { ReviewQueue } from './review-queue.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Everything here is a user-initiated request, so it slides the idle window
// (§10.5) — which is why the page asks only when the Reviewer does, and never
// on a timer.
@Controller('reviewer/queue')
@UseGuards(CsrfGuard, ReviewerAuthGuard)
export class ReviewQueueController {
  constructor(private readonly queue: ReviewQueue) {}

  @Get()
  list() {
    return this.queue.list();
  }

  @Get(':id')
  async dossier(@Param('id') id: string) {
    const dossier = UUID.test(id) ? await this.queue.dossier(id) : null;
    if (!dossier) throw new NotFoundException({ error: 'not_found' });
    return dossier;
  }
}
