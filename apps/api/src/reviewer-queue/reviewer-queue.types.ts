export interface QueueRow {
  id: string;
  referenceNumber: string;
  requesterName: string;
  workplace: string;
  diseaseGroupNameTh: string;
  submittedAt: string;
  businessHoursRemaining: number;
  timeRemainingLabel: string;
  isActionable: boolean;
}

export interface QueueListResult {
  requests: QueueRow[];
  refreshedAt: string;
}

/**
 * The Probe's single summed number (§5.4, §10.2) — or `"pending"` while it is
 * still running, or `"failed"` if it was abandoned. A Decision waits on none
 * of the three: approve is fully usable in every state.
 */
export type ProbeRowCount = number | "pending" | "failed";

export type AreaView =
  | { kind: "national"; label: string }
  | { kind: "province"; label: string }
  | { kind: "region"; label: string };

export interface ContactView {
  name: string;
  surname: string;
  tel: string;
  email: string;
  workplace: string;
}

export interface RequestDetail {
  id: string;
  referenceNumber: string;
  contact: ContactView;
  diseaseGroupNameTh: string;
  reportCodes: string[];
  fromDate: string;
  toDate: string;
  days: number;
  area: AreaView;
  submittedAt: string;
  decisionDueAt: string;
  businessHoursRemaining: number;
  timeRemainingLabel: string;
  isActionable: boolean;
  requestsAhead: number;
  probeRowCount: ProbeRowCount;
}

// The Decision (spec §10.3, §10.4, ticket #66) --------------------------

export interface RejectDecisionInput {
  note: string;
}

/**
 * What actually happened to a Decision attempt. `not_found` and
 * `not_pending` both mean "nothing was written" — the caller (controller)
 * decides the HTTP shape; this type only distinguishes what a Reviewer
 * needs to be told apart: a Request that vanished from under them (raced by
 * another Decision, or genuinely unknown) versus one that just aged out
 * while they were reading it (§10.4).
 */
export type DecisionOutcome =
  | { kind: "approved"; decidedAt: string }
  | { kind: "rejected"; decidedAt: string }
  | { kind: "expired"; expiredAt: string }
  | { kind: "not_found" }
  | { kind: "not_pending" }
  | { kind: "note_too_short" };

export type AmendNoteOutcome = { kind: "amended" } | { kind: "not_rejected" } | { kind: "note_too_short" };

