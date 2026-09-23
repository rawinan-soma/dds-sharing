import { and, eq, lt, lte } from 'drizzle-orm';
import { type MailKind } from '../audit/event-catalogue';
import { type Db } from '../db/database.module';
import { mailDelivery } from '../db/schema';

export class MailDeliveries {
  constructor(private readonly db: Db) {}

  /** One row per logical email (spec §11.3) — created when the send is enqueued. */
  async create(requestId: string, kind: MailKind): Promise<string> {
    const [{ id }] = await this.db
      .insert(mailDelivery)
      .values({ requestId, kind, status: 'queued' })
      .returning({ id: mailDelivery.id });
    return id;
  }

  /** Tries already made — the next try's number is this plus one. */
  async attempts(id: string): Promise<number> {
    const [row] = await this.db
      .select({ attempts: mailDelivery.attempts })
      .from(mailDelivery)
      .where(eq(mailDelivery.id, id));
    return row?.attempts ?? 0;
  }

  /** Failed sends whose 15 minutes are up and whose tries are not spent (§11.3). */
  async dueForRetry(
    failedBefore: Date,
    maxAttempts: number,
  ): Promise<{ id: string; requestId: string }[]> {
    return this.db
      .select({ id: mailDelivery.id, requestId: mailDelivery.requestId })
      .from(mailDelivery)
      .where(
        and(
          eq(mailDelivery.status, 'failed'),
          lt(mailDelivery.attempts, maxAttempts),
          lte(mailDelivery.updatedAt, failedBefore),
        ),
      );
  }

  /** Sends still `queued` since before `queuedBefore` — checked against Redis by the tick. */
  async queuedSince(
    queuedBefore: Date,
  ): Promise<{ id: string; requestId: string }[]> {
    return this.db
      .select({ id: mailDelivery.id, requestId: mailDelivery.requestId })
      .from(mailDelivery)
      .where(
        and(
          eq(mailDelivery.status, 'queued'),
          lte(mailDelivery.updatedAt, queuedBefore),
        ),
      );
  }

  /** The tick handed a failed send back to BullMQ for its next try. */
  async markRequeued(id: string, now: Date): Promise<void> {
    await this.db
      .update(mailDelivery)
      .set({ status: 'queued', updatedAt: now })
      .where(eq(mailDelivery.id, id));
  }

  async markSent(id: string, now: Date): Promise<void> {
    await this.db
      .update(mailDelivery)
      .set({ status: 'sent', updatedAt: now })
      .where(eq(mailDelivery.id, id));
  }

  async markFailed(
    id: string,
    attempts: number,
    lastError: string,
    now: Date,
  ): Promise<void> {
    await this.db
      .update(mailDelivery)
      .set({ status: 'failed', attempts, lastError, updatedAt: now })
      .where(eq(mailDelivery.id, id));
  }

  async markAbandoned(
    id: string,
    attempts: number,
    lastError: string,
    now: Date,
  ): Promise<void> {
    await this.db
      .update(mailDelivery)
      .set({ status: 'abandoned', attempts, lastError, updatedAt: now })
      .where(eq(mailDelivery.id, id));
  }
}
