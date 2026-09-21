const ROOT = '/reviewer';
// The two screens a Reviewer is sent to; returning to either would loop.
const GATES = ['/reviewer/sign-in', '/reviewer/password'];

const isGate = (path: string) =>
  GATES.some(
    (gate) => path === gate || /^\/reviewer\/(sign-in|password)[?#]/.test(path),
  );

/**
 * A return-to address is user-supplied (it arrives in a query string), so it
 * is followed only when it is a path inside the Reviewer surface. Anything
 * else, including an absolute or protocol-relative URL, goes to the root.
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith(ROOT)) return ROOT;
  if (value !== ROOT && !/^\/reviewer[/?#]/.test(value)) return ROOT;
  if (value.includes('\\') || value.includes('..') || value.startsWith('//')) {
    return ROOT;
  }
  if (isGate(value)) return ROOT;
  return value;
}

/** The query params that carry a Reviewer back to where they were. */
export function signInQueryFor(url: string): { returnTo?: string } {
  const target = safeReturnTo(url);
  return target === ROOT ? {} : { returnTo: target };
}
