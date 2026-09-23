import { and, eq, sql, type SQL } from 'drizzle-orm';
import { requestEvent } from '../db/schema';
import { type MailKind } from './event-catalogue';

/**
 * `request_event` rows recording that the relay accepted an email of `kind`.
 * The catalogue's `mail_sent` carries the kind in its payload, so this is the
 * one place that knows how to ask for "the Delivery" or "the queue
 * notification".
 */
export const mailSentOfKind = (kind: MailKind): SQL | undefined =>
  and(
    eq(requestEvent.type, 'mail_sent'),
    sql`${requestEvent.payload}->>'kind' = ${kind}`,
  );
