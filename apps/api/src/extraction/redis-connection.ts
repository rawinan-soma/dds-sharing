import Redis from 'ioredis';

/**
 * BullMQ's own requirement for a connection it did not construct itself:
 * `maxRetriesPerRequest: null`, so a Worker's blocking calls are never
 * silently retried out from under it.
 */
export function createRedisConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}
