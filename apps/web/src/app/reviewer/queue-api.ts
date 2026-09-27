import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

// What the server sends the queue screen. Times are instants; the screen turns
// them into ICT and Buddhist-era text at the edge.
export interface QueueRow {
  id: string;
  reference: string;
  submittedAt: string;
  expiresAt: string;
  /** Business minutes left as of the read; zero once expired. */
  minutesLeft: number;
  expired: boolean;
  /** Requests ahead of this one. Null once expired: it is not in line. */
  ahead: number | null;
  requesterName: string;
  diseaseGroupName: string;
}

export type AlertKind =
  'send_abandoned' | 'collection_lapse' | 'extraction_failure';

/** The closed sets a Reviewer clears from; `re_ran` is the system's alone. */
export type AlertOutcome =
  | 'reached_requester'
  | 'could_not_reach_requester'
  | 'no_action_needed'
  | 'contacted_requester'
  | 'abandoned';

/** A must-clear item on the queue (spec §10.6), as the signed-in Reviewer sees it. */
export interface AlertRow {
  requestId: string;
  reference: string;
  requesterName: string;
  kind: AlertKind;
  raisedAt: string;
  /** A Re-run is under way: nothing to choose until it settles. */
  deferred: boolean;
  rerunAttempts: number;
  /** The approving Reviewer, named whether or not still active. */
  assignedTo: { displayName: string; active: boolean };
  outcomes: AlertOutcome[];
  /** Whether this Reviewer may clear it now. */
  clearable: boolean;
  /** A collection lapse's silence, in wall-clock hours since the Delivery. */
  silentHours: number | null;
}

export interface AlertDetail {
  alerts: AlertRow[];
  /** Null once the Request is terminal: contact leaves with it (ADR 0015). */
  contact: Dossier['contact'] | null;
}

export type AlertDetailOutcome =
  { kind: 'ok'; detail: AlertDetail } | { kind: 'gone' } | { kind: 'failed' };

/** Where a cleared Request went: back in flight, or off the surface. */
export type ClearOutcome =
  | { kind: 'cleared'; zone: 'in_flight' | null }
  | { kind: 'gone' }
  /** A Re-run started since this was read: nothing to choose until it settles. */
  | { kind: 'deferred' }
  | { kind: 'refused' }
  | { kind: 'failed' };

/** How an approved Request's row reads: its newest job, in words. */
export type ExtractionState = 'extracting' | 'ready' | 'failed';

/** What can physically be done to it now (spec §10.9). */
export interface InFlightActions {
  rerun: boolean;
  resend: boolean;
}

/** An approved Request not yet terminal. Never names who approved it. */
export interface InFlightRow {
  requestId: string;
  reference: string;
  submittedAt: string;
  requesterName: string;
  diseaseGroupName: string;
  extraction: ExtractionState;
  /** Wall-clock: a timestamp the system acts on. Null until a link exists. */
  linkExpiresAt: string | null;
  actions: InFlightActions;
}

/** One in-flight Request, opened (ADR 0015: live contact fields). */
export interface InFlightDetail extends InFlightRow {
  contact: Dossier['contact'];
  reportCodes: string[];
  startDate: string;
  endDate: string;
  area: Area;
  approvedBy: string;
  approvedAt: string;
  /** The current file, never its token; it expires at `linkExpiresAt`. */
  file: {
    archiveFilename: string;
    attempts: number;
  } | null;
}

export type InFlightDetailOutcome =
  | { kind: 'ok'; detail: InFlightDetail }
  | { kind: 'gone' }
  | { kind: 'failed' };

/** What pressing Re-run or resend came back with. */
export type ActionOutcome =
  | { kind: 'done' }
  /** No longer in flight: finished, or now under Needs attention. */
  | { kind: 'gone' }
  /** Refused as not possible now: extracting, or nothing to resend. */
  | { kind: 'not_possible' }
  /** The sent Delivery is no longer held, so it cannot be resent. */
  | { kind: 'unavailable' }
  | { kind: 'failed' };

export interface QueueList {
  generatedAt: string;
  /** `stopped` puts the banner up: the tick has stopped (spec §15.3). */
  automaticProcessing: 'running' | 'stopped';
  requests: QueueRow[];
  alerts: AlertRow[];
  inFlight: InFlightRow[];
}

export type Area =
  | { kind: 'national' }
  | {
      kind: 'provinces';
      provinces: { id: string; name: string }[];
      region: number | null;
    };

export interface Dossier extends QueueRow {
  contact: {
    name: string;
    surname: string;
    tel: string;
    email: string;
    workplace: string;
  };
  reportCodes: string[];
  startDate: string;
  endDate: string;
  area: Area;
  /** A summed count, or the Probe's still-pending or abandoned state. */
  rowCount: number | 'pending' | 'failed';
}

export type DossierOutcome =
  { kind: 'ok'; dossier: Dossier } | { kind: 'gone' } | { kind: 'failed' };

/** What approve or reject came back with (spec §10.3, §10.4). */
export type DecisionOutcome =
  | { kind: 'recorded'; decision: 'approved' | 'rejected'; decidedAt: string }
  | { kind: 'expired' }
  | { kind: 'gone' }
  | { kind: 'invalid_note' }
  | { kind: 'failed' };

/** The three zones of the Reviewer surface: a Request is in one, or none. */
export type SurfaceZone = 'queue' | 'alerts' | 'in_flight';

/** The closed catalogue of what can happen to a Request (spec §12.4). */
export type RequestEventType =
  | 'submitted'
  | 'probe_performed'
  | 'probe_failed'
  | 'approved'
  | 'rejected'
  | 'note_amended'
  | 'expired'
  | 'job_queued'
  | 'job_deferred_low_disk'
  | 'job_started'
  | 'code_fetched'
  | 'job_completed'
  | 'job_failed'
  | 'extraction_alert_raised'
  | 'extraction_alert_cleared'
  | 'extraction_rerun_queued'
  | 'mail_sent'
  | 'mail_send_failed'
  | 'mail_send_abandoned'
  | 'delivery_alert_raised'
  | 'download_attempted'
  | 'collection_lapse_raised'
  | 'collection_lapse_cleared'
  | 'download_token_revoked'
  | 'expired_uncollected'
  | 'object_deleted';

/** How a file's link reads now. */
export type LinkState = 'live' | 'used_up' | 'expired' | 'revoked';

/** The ways a Request ends (spec §10.9). */
export type TerminalState =
  'rejected' | 'expired' | 'collected' | 'expired_uncollected' | 'abandoned';

/**
 * A terminal Request, read-only (spec §10.10). The record, never the contact
 * fields (ADR 0015): the only workplace here is the Snapshot's.
 */
export interface RequestRecord {
  requestId: string;
  reference: string;
  state: TerminalState;
  submittedAt: string;
  diseaseGroupName: string;
  reportCodes: string[];
  startDate: string;
  endDate: string;
  area: Area;
  /** Null for a Request that expired with no Decision. */
  decision: {
    outcome: 'approved' | 'rejected';
    reviewer: string;
    decidedAt: string;
    workplace: string;
    /** As the Snapshot holds it: what the Reviewer had on screen. */
    rowCount: number | 'pending' | 'failed';
  } | null;
  /** Every file, newest run first. Never a token. */
  files: {
    run: number;
    archiveFilename: string;
    link: LinkState;
    expiresAt: string;
    attempts: number;
  }[];
  /** Newest first. Never a payload. */
  events: {
    type: RequestEventType;
    occurredAt: string;
    actor: 'requester' | 'reviewer' | 'system' | 'anonymous';
    /** The Reviewer's name, for a `reviewer` actor only. */
    reviewer: string | null;
  }[];
}

/** What a lookup by reference found: where it is, or its record. */
export type LookupOutcome =
  | { kind: 'zone'; zone: SurfaceZone; requestId: string }
  | { kind: 'record'; record: RequestRecord }
  | { kind: 'not_found' }
  | { kind: 'failed' };

const BASE = '/api/reviewer/queue';
const ALERTS_BASE = '/api/reviewer/alerts';
const IN_FLIGHT_BASE = '/api/reviewer/in-flight';
const REQUESTS_BASE = '/api/reviewer/requests';
const LOOKUP_BASE = '/api/reviewer/lookup';

// Every call here is one the Reviewer asked for. Nothing calls it on a timer:
// only user-initiated requests extend the session (§10.5).
@Injectable({ providedIn: 'root' })
export class QueueApi {
  private readonly http = inject(HttpClient);

  list(): Promise<QueueList> {
    return firstValueFrom(this.http.get<QueueList>(BASE));
  }

  async dossier(id: string): Promise<DossierOutcome> {
    try {
      const dossier = await firstValueFrom(
        this.http.get<Dossier>(`${BASE}/${encodeURIComponent(id)}`),
      );
      return { kind: 'ok', dossier };
    } catch (error) {
      return error instanceof HttpErrorResponse && error.status === 404
        ? { kind: 'gone' }
        : { kind: 'failed' };
    }
  }

  approve(id: string): Promise<DecisionOutcome> {
    return this.decide(`${BASE}/${encodeURIComponent(id)}/approve`, {});
  }

  reject(id: string, note: string): Promise<DecisionOutcome> {
    return this.decide(`${BASE}/${encodeURIComponent(id)}/reject`, { note });
  }

  async alertDetail(requestId: string): Promise<AlertDetailOutcome> {
    try {
      const detail = await firstValueFrom(
        this.http.get<AlertDetail>(
          `${ALERTS_BASE}/${encodeURIComponent(requestId)}`,
        ),
      );
      return { kind: 'ok', detail };
    } catch (error) {
      return error instanceof HttpErrorResponse && error.status === 404
        ? { kind: 'gone' }
        : { kind: 'failed' };
    }
  }

  /** A kind and an outcome from its closed set: the body carries nothing else. */
  async clearAlert(
    requestId: string,
    kind: AlertKind,
    outcome: AlertOutcome,
  ): Promise<ClearOutcome> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ zone: 'in_flight' | null }>(
          `${ALERTS_BASE}/${encodeURIComponent(requestId)}/clear`,
          { kind, outcome },
        ),
      );
      return { kind: 'cleared', zone: res.zone };
    } catch (error) {
      if (!(error instanceof HttpErrorResponse)) return { kind: 'failed' };
      if (error.status === 404) return { kind: 'gone' };
      if (error.status === 409) return { kind: 'deferred' };
      if (error.status === 403) return { kind: 'refused' };
      return { kind: 'failed' };
    }
  }

  async inFlightDetail(requestId: string): Promise<InFlightDetailOutcome> {
    try {
      const detail = await firstValueFrom(
        this.http.get<InFlightDetail>(
          `${IN_FLIGHT_BASE}/${encodeURIComponent(requestId)}`,
        ),
      );
      return { kind: 'ok', detail };
    } catch (error) {
      return error instanceof HttpErrorResponse && error.status === 404
        ? { kind: 'gone' }
        : { kind: 'failed' };
    }
  }

  /** Exact reference only (spec §10.10): there is no other way to search. */
  async lookup(reference: string): Promise<LookupOutcome> {
    try {
      const found = await firstValueFrom(
        this.http.get<
          | { zone: SurfaceZone; requestId: string }
          | { zone: null; record: RequestRecord }
        >(LOOKUP_BASE, { params: { reference } }),
      );
      return found.zone === null
        ? { kind: 'record', record: found.record }
        : { kind: 'zone', zone: found.zone, requestId: found.requestId };
    } catch (error) {
      return error instanceof HttpErrorResponse && error.status === 404
        ? { kind: 'not_found' }
        : { kind: 'failed' };
    }
  }

  /** A second extraction of what was approved. The body carries nothing. */
  rerun(requestId: string): Promise<ActionOutcome> {
    return this.act(`${REQUESTS_BASE}/${encodeURIComponent(requestId)}/rerun`);
  }

  /**
   * The same email to the same address. The body carries nothing, and there
   * is deliberately no way to name another address (ADR 0017).
   */
  resend(requestId: string): Promise<ActionOutcome> {
    return this.act(`${REQUESTS_BASE}/${encodeURIComponent(requestId)}/resend`);
  }

  private async act(path: string): Promise<ActionOutcome> {
    try {
      await firstValueFrom(this.http.post(path, {}));
      return { kind: 'done' };
    } catch (error) {
      if (!(error instanceof HttpErrorResponse)) return { kind: 'failed' };
      const code = (error.error as { error?: string } | null)?.error;
      if (error.status === 404) return { kind: 'gone' };
      if (error.status === 409 && code === 'resend_unavailable') {
        return { kind: 'unavailable' };
      }
      if (error.status === 409) return { kind: 'not_possible' };
      return { kind: 'failed' };
    }
  }

  private async decide(
    path: string,
    body: Record<string, unknown>,
  ): Promise<DecisionOutcome> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ outcome: 'approved' | 'rejected'; decidedAt: string }>(
          path,
          body,
        ),
      );
      return {
        kind: 'recorded',
        decision: res.outcome,
        decidedAt: res.decidedAt,
      };
    } catch (error) {
      if (!(error instanceof HttpErrorResponse)) return { kind: 'failed' };
      const code = (error.error as { error?: string } | null)?.error;
      if (error.status === 409 && code === 'expired')
        return { kind: 'expired' };
      if (error.status === 404) return { kind: 'gone' };
      if (error.status === 400 && code === 'invalid_note') {
        return { kind: 'invalid_note' };
      }
      return { kind: 'failed' };
    }
  }
}
