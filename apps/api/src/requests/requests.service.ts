import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { writeRequestEvent } from '../audit/write-request-event';
import { appConfig } from '../config/namespaces';
import { PG_POOL } from '../db/database.module';
import { request, requestContact, reviewer } from '../db/schema';
import { MailSender } from '../mail/mail-sender';
import { requestExpiry } from '../clock/business-hours';
import { formatIct } from '../clock/format-ict';
import { type RequestPlan } from './plan-request';
import { ProbeService } from './probe.service';
import { formatReference } from './reference-number';
import { TERMINAL_REQUEST_STATES } from './request-state';

/** Where the submit came from, for the audit record only (§3.3). */
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
        // Duplicate suppression (§4.8): the same form sent twice — same email,
        // Disease group, dates and area as stored — while the first is
        // unfinished. The email is a match key, never a control key. In the
        // words of §4.8: "Matching on the email is not verifying it: the
        // address is still free text that nobody checks, and this rule reads
        // it only to recognise the same form sent twice." That is why the
        // refusal names nothing.
        //
        // It has to be atomic with the insert, or a double-posted form — the
        // very thing it exists for — races past its own check. Serialise per
        // normalised email; different emails never wait on each other.
        // Stored emails are already trimmed (`planRequest`), so only case is
        // left to fold, on both sides.
        const email = plan.contact.email.toLowerCase();
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`request-submit:${email}`}, 0))`,
        );

        const [unfinished] = await tx
          .select({ id: request.id })
          .from(request)
          .innerJoin(requestContact, eq(requestContact.requestId, request.id))
          .where(
            and(
              eq(sql`lower(${requestContact.email})`, email),
              eq(request.diseaseGroupId, plan.diseaseGroupId),
              eq(request.startDate, plan.startDate),
              eq(request.endDate, plan.endDate),
              // The area as stored, in any order: region 13 and the province
              // กรุงเทพมหานคร are the same ask, and national is only national.
              sql`${request.provinces}::text[] @> ${sql.param(plan.provinces)}::text[]`,
              sql`${request.provinces}::text[] <@ ${sql.param(plan.provinces)}::text[]`,
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
