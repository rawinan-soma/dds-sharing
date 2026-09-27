import {
  Controller,
  Get,
  NotFoundException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';
import { referenceFrom } from './lookup';
import { RequestLookup } from './lookup.service';
import { ReviewerAuthGuard } from './reviewer-auth.guard';

// Looking up a Request by its exact reference (spec §10.10): the one way a
// Reviewer reaches a Request that has left the surface. Exact reference only,
// and never a search by person — that is the prior-Request history §10.2
// declined, by another route. Read-only: it carries no action, and writes no
// event.
@Controller('reviewer/lookup')
@UseGuards(CsrfGuard, ReviewerAuthGuard)
export class LookupController {
  constructor(private readonly lookup: RequestLookup) {}

  @Get()
  async find(@Query('reference') input: unknown) {
    const reference = referenceFrom(input);
    const found = reference ? await this.lookup.find(reference) : null;
    if (!found) throw new NotFoundException({ error: 'not_found' });
    return found;
  }
}
