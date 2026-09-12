const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const BUDDHIST_ERA_OFFSET = 543;

/**
 * The Buddhist-era year of the Bangkok-local date `at` falls on (spec
 * §12.5: "`REQ-2569-0142` in shape — Buddhist-era year"). Asia/Bangkok has
 * no DST, so a fixed +7 offset is exact, not an approximation.
 */
export function buddhistYearOf(at: Date): number {
  const bangkokLocal = new Date(at.getTime() + BANGKOK_OFFSET_MS);
  return bangkokLocal.getUTCFullYear() + BUDDHIST_ERA_OFFSET;
}

/**
 * `REQ-{buddhist year}-{counter}` (spec §12.5). The counter is zero-padded
 * to four digits but never truncated — the shape is a display label, not a
 * capacity limit.
 */
export function formatReferenceNumber(
  buddhistYear: number,
  counter: number,
): string {
  return `REQ-${buddhistYear}-${String(counter).padStart(4, "0")}`;
}
