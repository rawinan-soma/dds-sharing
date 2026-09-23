/**
 * BullMQ's Redis key prefix, namespaced by the application database's own
 * name. In production this is one stable value. In an e2e suite, every test
 * file runs its own app instance against its own throwaway scratch database
 * on a *shared* Redis (`test/support/scratch-database.ts`) — without this,
 * every such instance's Worker would compete for the same queue key space and
 * could pick up and process a job that belongs to a different test file's
 * Postgres. Shared by every BullMQ-backed module (extraction, mail).
 */
export function bullPrefix(databaseUrl: string): string {
  return new URL(databaseUrl).pathname.replace(/^\//, '') || 'dds';
}
