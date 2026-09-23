import { eq } from 'drizzle-orm';
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
