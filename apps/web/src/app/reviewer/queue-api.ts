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
}
