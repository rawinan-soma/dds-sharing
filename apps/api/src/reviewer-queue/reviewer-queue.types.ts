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
