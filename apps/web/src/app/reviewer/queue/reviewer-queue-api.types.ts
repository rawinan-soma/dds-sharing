// Mirrors apps/api/src/reviewer-queue/reviewer-queue.types.ts — keep in sync.

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
  | { kind: 'national'; label: string }
  | { kind: 'province'; label: string }
  | { kind: 'region'; label: string };

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
  probeRowCount: number | 'pending' | 'failed';
}
