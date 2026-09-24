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
  /** The current file, never its token. Null until one is ready. */
  file: {
    archiveFilename: string;
    linkExpiresAt: string;
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

const BASE = '/api/reviewer/queue';
const ALERTS_BASE = '/api/reviewer/alerts';
const IN_FLIGHT_BASE = '/api/reviewer/in-flight';
const REQUESTS_BASE = '/api/reviewer/requests';

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
