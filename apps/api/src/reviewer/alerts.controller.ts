import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ALERT_KINDS,
  ALERT_OUTCOMES,
  type AlertKind,
  type AlertOutcome,
} from './alerts';
import { Alerts } from './alerts.service';
import { CsrfGuard } from './csrf.guard';
import { reviewerOf } from './decision-http';
import { ReviewerAuthGuard, type ReviewerRequest } from './reviewer-auth.guard';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Alerts on the queue (§10.6). The list itself arrives with the queue's, in
// one read; this is the one Request's detail and the one way to clear.
@Controller('reviewer/alerts')
@UseGuards(CsrfGuard, ReviewerAuthGuard)
export class AlertsController {
  constructor(private readonly alerts: Alerts) {}

  @Get(':id')
  async detail(@Param('id') id: string, @Req() req: ReviewerRequest) {
    const detail = UUID.test(id)
      ? await this.alerts.detail(id, reviewerOf(req).reviewerId)
      : null;
    if (!detail) throw new NotFoundException({ error: 'not_found' });
    return detail;
  }

  @Post(':id/clear')
  @HttpCode(200)
  async clear(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: ReviewerRequest,
  ) {
    if (!UUID.test(id)) throw new NotFoundException({ error: 'not_found' });
    const { kind, outcome } = clearingFrom(body);
    const result = await this.alerts.clear(
      id,
      kind,
      outcome,
      reviewerOf(req).reviewerId,
    );
    switch (result.status) {
      case 'cleared':
        return { clearedAt: result.clearedAt, zone: result.zone };
      case 'not_open':
        throw new NotFoundException({ error: 'not_found' });
      case 'deferred':
        throw new ConflictException({ error: 'deferred' });
      case 'not_permitted':
        throw new ForbiddenException({ error: 'not_permitted' });
    }
  }
}

/**
 * A kind and an outcome from that kind's closed set, and nothing else. Any
 * other field is refused rather than ignored: there is no free text on any
 * clear path (§10.6), and a note the server quietly dropped would read to its
 * writer as though it were kept.
 */
function clearingFrom(body: unknown): {
  kind: AlertKind;
  outcome: AlertOutcome;
} {
  const fields = (body ?? {}) as Record<string, unknown>;
  const { kind, outcome } = fields;
  const onlyThose = Object.keys(fields).every(
    (key) => key === 'kind' || key === 'outcome',
  );
  if (!onlyThose || !(ALERT_KINDS as readonly unknown[]).includes(kind)) {
    throw new BadRequestException({ error: 'bad_request' });
  }
  const closedSet: readonly unknown[] = ALERT_OUTCOMES[kind as AlertKind];
  if (!closedSet.includes(outcome)) {
    throw new BadRequestException({ error: 'invalid_outcome' });
  }
  return { kind: kind as AlertKind, outcome: outcome as AlertOutcome };
}
