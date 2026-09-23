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

export interface QueueList {
  generatedAt: string;
  /** `stopped` puts the banner up: the tick has stopped (spec §15.3). */
  automaticProcessing: 'running' | 'stopped';
  requests: QueueRow[];
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
