import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { writeRequestEvent } from '../audit/write-request-event';
import { appConfig } from '../config/namespaces';
import { PG_POOL } from '../db/database.module';
import { request, requestContact, requestEvent, reviewer } from '../db/schema';
import { MailSender } from '../mail/mail-sender';
import { requestExpiry } from '../clock/business-hours';
import { type RequestPlan } from './plan-request';
import { ProbeService } from './probe.service';
import { formatReference } from './reference-number';
import { TERMINAL_REQUEST_STATES } from './request-state';

const ICT_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** `YYYY-MM-DD HH:mm ICT` — via `Intl`, not manual offset arithmetic: the
 * span builder is the only file allowed day arithmetic (§17.1's tripwire),
 * and this is display formatting, not a Request span. */
function formatIct(date: Date): string {
  const parts = ICT_FORMAT.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} ICT`;
}

/** Who is asking, as far as the system can tell: network origin only (§3.3). */
export interface Origin {
  ip: string;
  userAgent: string;
}

export type SubmitOutcome =
  { status: 'submitted'; reference: string } | { status: 'in_progress' };

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);
  private readonly db;

  constructor(
    @Inject(PG_POOL) pool: Pool,
    private readonly probe: ProbeService,
    private readonly mailSender: MailSender,
    @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
  ) {
    this.db = drizzle(pool);
  }

  // Stores the Request, its contact details and the `submitted` event in one
  // transaction: there is never a Request with no event, or an event for a
  // Request that was not stored.
  async submit(
    plan: RequestPlan,
    origin: Origin,
    now = new Date(),
  ): Promise<SubmitOutcome> {
    let requestId: string | undefined;
    const outcome = await this.db.transaction(
      async (tx): Promise<SubmitOutcome> => {
        // Duplicate suppression (§4.8) has to be atomic with the insert, or a
        // double-posted form — the very thing it exists for — races past its own
        // check. Serialise per IP; other IPs never wait on each other.
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${origin.ip}, 0))`,
        );

        const [unfinished] = await tx
          .select({ id: request.id })
          .from(request)
          .innerJoin(
            requestEvent,
            and(
              eq(requestEvent.requestId, request.id),
              eq(requestEvent.type, 'submitted'),
            ),
          )
          .where(
            and(
              eq(requestEvent.ip, origin.ip),
              notInArray(request.state, [...TERMINAL_REQUEST_STATES]),
            ),
          )
          .limit(1);
        if (unfinished) return { status: 'in_progress' };

        const counter = await tx.execute<{ n: string }>(
          sql`SELECT nextval('request_reference_seq') AS n`,
        );
        const reference = formatReference(now, Number(counter.rows[0].n));

        const [{ id }] = await tx
          .insert(request)
          .values({
            reference,
            submittedAt: now,
            diseaseGroupId: plan.diseaseGroupId,
            diseaseGroupName: plan.diseaseGroupName,
            startDate: plan.startDate,
            endDate: plan.endDate,
            reportCodes: plan.reportCodes,
            provinces: plan.provinces,
          })
          .returning({ id: request.id });
        requestId = id;

        await tx
          .insert(requestContact)
          .values({ requestId: id, ...plan.contact });

        await writeRequestEvent(tx, {
          requestId: id,
          type: 'submitted',
          occurredAt: now,
          actor: {
            actorType: 'requester',
            ip: origin.ip,
            userAgent: origin.userAgent,
          },
          payload: {},
        });

        return { status: 'submitted', reference };
      },
    );

    // Off the submit path (spec §5.4): fired after commit, so the Probe never
    // races the row it writes events against, and never awaited, so the
    // response is never held up for it.
    if (outcome.status === 'submitted' && requestId) {
      void this.probe.run({
        requestId,
        reportCodes: plan.reportCodes,
        startDate: plan.startDate,
        endDate: plan.endDate,
      });
      void this.notifyReviewers(requestId, outcome.reference, plan, now);
    }

    return outcome;
  }

  /**
   * The Reviewer queue notification (spec §11.3): the only notification
   * channel there is — the queue page does not update itself. Sent to every
   * active Reviewer as one email, off the submit path like the Probe above —
   * and, like `ProbeService.run`, self-catching: the caller does not await
   * this and never rejects, so a failure here must strand only the
   * notification, never crash the request that just committed.
   */
  private async notifyReviewers(
    requestId: string,
    reference: string,
    plan: RequestPlan,
    now: Date,
  ): Promise<void> {
    try {
      const activeReviewers = await this.db
        .select({ email: reviewer.email })
        .from(reviewer)
        .where(isNull(reviewer.deactivatedAt));
      if (activeReviewers.length === 0) return;

      const deadline = requestExpiry(now, now).expiresAt;
      await this.mailSender.send(
        requestId,
        activeReviewers.map((r) => r.email).join(', '),
        {
          kind: 'queue_notification',
          reference,
          requesterName: `${plan.contact.name} ${plan.contact.surname}`,
          workplace: plan.contact.workplace,
          deadline: formatIct(deadline),
          queueUrl: `${this.app.frontendUrl}/reviewer`,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to notify Reviewers for request ${requestId}: ${(error as Error).message}`,
      );
    }
  }
}
