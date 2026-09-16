export const EXTRACTION_QUEUE_NAME = "extraction";

/**
 * Global extraction concurrency (spec §7.7, §13.2). Keyed on nothing — a
 * **reviewed constant in code, never an environment variable** (ADR 0018):
 * eight concurrent upstream calls degraded to ~14.3 s each with zero
 * throughput gained (§5.3), so raising this buys nothing and costs DDC
 * noticing more traffic than it needs to. Do not tune it upward expecting
 * throughput.
 */
export const EXTRACTION_CONCURRENCY = 1;

/**
 * How many times a job may be deferred for low disk before BullMQ gives up
 * on it (spec §7.8: "wait loudly rather than run and die"). Large rather
 * than unbounded — BullMQ has no literal "retry forever" — with a fixed
 * delay between checks; an operator who lets disk stay full this long has
 * bigger problems than one Request's job.
 */
export const LOW_DISK_MAX_DEFERRALS = 1000;
export const LOW_DISK_RETRY_DELAY_MS = 5 * 60 * 1000;
