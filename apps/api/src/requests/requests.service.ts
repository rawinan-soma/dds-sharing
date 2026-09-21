import { Inject, Injectable } from '@nestjs/common';
import { and, eq, notInArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { writeRequestEvent } from '../audit/write-request-event';
import { PG_POOL } from '../db/database.module';
import { request, requestContact, requestEvent } from '../db/schema';
import { type RequestPlan } from './plan-request';
import { formatReference } from './reference-number';
import { TERMINAL_REQUEST_STATES } from './request-state';

/** Who is asking, as far as the system can tell: network origin only (§3.3). */
export interface Origin {
  ip: string;
  userAgent: string;
}

export type SubmitOutcome =
  { status: 'submitted'; reference: string } | { status: 'in_progress' };

@Injectable()
export class RequestsService {
  private readonly db;

  constructor(@Inject(PG_POOL) pool: Pool) {
    this.db = drizzle(pool);
  }

  // Stores the Request, its contact details and the `submitted` event in one
  // transaction: there is never a Request with no event, or an event for a
  // Request that was not stored. Nothing is fetched from upstream and no
  // Reviewer is told; that is the next slice.
  async submit(
    plan: RequestPlan,
    origin: Origin,
    now = new Date(),
  ): Promise<SubmitOutcome> {
    return this.db.transaction(async (tx) => {
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
    });
  }
}
