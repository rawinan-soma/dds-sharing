import { Redis } from "ioredis";

/**
 * BullMQ requires `maxRetriesPerRequest: null` on any connection it drives —
 * it does its own retry/backoff and a client-level retry limit fights that.
 * A fresh connection per caller (Queue, Worker, reconcile) rather than one
 * shared instance, matching BullMQ's own guidance that a blocking Worker
 * connection should not be reused for other commands.
 */
export function createExtractionRedisConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}
