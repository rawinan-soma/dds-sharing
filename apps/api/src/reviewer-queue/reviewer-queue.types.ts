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
  /**
   * Honest placeholder (spec §10.2 / ticket #65): the Probe that fills this
   * in is a later slice. `null` here, never a fabricated number, "pending",
   * or "failed" — those three real states arrive with the Probe.
   */
  probeRowCount: null;
}
