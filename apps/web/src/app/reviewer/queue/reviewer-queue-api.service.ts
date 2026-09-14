import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { QueueListResult, RequestDetail } from './reviewer-queue-api.types.js';

export type QueueListOutcome =
  | { outcome: 'ok'; result: QueueListResult }
  | { outcome: 'unauthenticated' }
  | { outcome: 'unexpected' };
export type RequestDetailOutcome =
  | { outcome: 'ok'; result: RequestDetail }
  | { outcome: 'not_found' }
  | { outcome: 'unauthenticated' }
  | { outcome: 'unexpected' };

/**
 * Talks to `/api/reviewer/queue*` (spec §10.1, §10.2, ticket #65) — read-only.
 * Every call here is user-initiated (a page load or a Refresh press), which
 * is what lets it extend the session without the queue ever polling (§10.5).
 */
@Injectable({ providedIn: 'root' })
export class ReviewerQueueApiService {
  private readonly http = inject(HttpClient);

  async listPending(): Promise<QueueListOutcome> {
    try {
      const result = await firstValueFrom(
        this.http.get<QueueListResult>('/api/reviewer/queue', { withCredentials: true }),
      );
      return { outcome: 'ok', result };
    } catch (error: unknown) {
      if ((error as { status?: number }).status === 401) return { outcome: 'unauthenticated' };
      return { outcome: 'unexpected' };
    }
  }

  async getDetail(id: string): Promise<RequestDetailOutcome> {
    try {
      const result = await firstValueFrom(
        this.http.get<RequestDetail>(`/api/reviewer/queue/${encodeURIComponent(id)}`, { withCredentials: true }),
      );
      return { outcome: 'ok', result };
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      if (status === 404) return { outcome: 'not_found' };
      if (status === 401) return { outcome: 'unauthenticated' };
      return { outcome: 'unexpected' };
    }
  }
}
