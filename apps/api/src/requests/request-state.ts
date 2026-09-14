// The Request lifecycle (spec §2, design_handoff_dds_sharing/README.md
// "Lifecycle"): pending -> {queued -> running -> ready -> delivered ->
// collected}, with pending -> rejected, pending -> expired, queued|running
// -> failed, delivered -> expired_uncollected. This ticket (#63) only ever
// writes `pending` — the rest are reachable by later tickets — but the enum
// is declared whole, matching how events.ts's catalogues are declared whole
// before every producer exists.
export const REQUEST_STATES = [
  "pending",
  "queued",
  "running",
  "ready",
  "delivered",
  "collected",
  "rejected",
  "expired",
  "failed",
  "expired_uncollected",
] as const;
export type RequestState = (typeof REQUEST_STATES)[number];

// §4.8 / design_handoff screen 4: a Request is "unfinished" — and so blocks
// a duplicate submit from the same IP — only while nothing has come of it
// yet. This is UX guarding a refresh or a double-posted form, not a rate
// limit, so it lifts the moment the Requester has something to show for the
// submit (delivered) or the attempt has run its course (failed, then a
// fresh Request is the only way forward) — both excluded here alongside the
// terminal states (rejected, expired, expired_uncollected, collected).
export const UNFINISHED_REQUEST_STATES = [
  "pending",
  "queued",
  "running",
  "ready",
] as const satisfies readonly RequestState[];

// §4.4: Area selection is national (the default), one province, or one
// health region — never a combination.
export const AREA_KINDS = ["national", "province", "region"] as const;
export type AreaKind = (typeof AREA_KINDS)[number];
