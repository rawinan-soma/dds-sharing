import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { DecisionOutcome, QueueListResult, RequestDetail } from './reviewer-queue-api.types.js';

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

  private async fetchCsrfToken(): Promise<string> {
    const { csrfToken } = await firstValueFrom(
      this.http.get<{ csrfToken: string }>('/api/reviewer/csrf', { withCredentials: true }),
    );
    return csrfToken;
  }

  /** The Decision (spec §10.3) — approve releases the Request; nothing here polls or replays. */
  async approve(id: string): Promise<DecisionOutcome> {
    return this.decide(`/api/reviewer/queue/${encodeURIComponent(id)}/approve`, {});
  }

  /** The Decision (spec §10.3) — reject carries the mandatory internal note. */
  async reject(id: string, note: string): Promise<DecisionOutcome> {
    return this.decide(`/api/reviewer/queue/${encodeURIComponent(id)}/reject`, { note });
  }

  private async decide(url: string, body: Record<string, unknown>): Promise<DecisionOutcome> {
    try {
      const csrfToken = await this.fetchCsrfToken();
      return await firstValueFrom(
        this.http.post<DecisionOutcome>(url, body, { withCredentials: true, headers: { 'x-csrf-token': csrfToken } }),
      );
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      const errorBody = (error as { error?: { code?: string; expiredAt?: string } }).error;
      if (status === 401) return { outcome: 'unauthenticated' };
      if (status === 409 && errorBody?.code === 'expired') {
        return { outcome: 'expired', expiredAt: errorBody.expiredAt ?? new Date().toISOString() };
      }
      if (status === 409 && errorBody?.code === 'note_too_short') return { outcome: 'note_too_short' };
      if (status === 409) return { outcome: 'not_pending' };
      return { outcome: 'unexpected' };
    }
  }
}
