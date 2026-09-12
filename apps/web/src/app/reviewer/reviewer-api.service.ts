import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface SignInResponse {
  displayName: string;
  mustChangePassword: boolean;
  absoluteExpiresAt: string;
}

export type SignInOutcome =
  | { outcome: 'success'; result: SignInResponse }
  | { outcome: 'invalid_credentials' }
  | { outcome: 'throttled' }
  | { outcome: 'unexpected' };

/**
 * Talks to `/api/reviewer/*` (spec §17.5). The CSRF cookie/header dance is
 * kept here so the sign-in component only ever sees "it worked" or one of
 * the three outcomes it needs to react to — never a factor, never a status
 * code.
 */
@Injectable({ providedIn: 'root' })
export class ReviewerApiService {
  private readonly http = inject(HttpClient);

  private async fetchCsrfToken(): Promise<string> {
    const { csrfToken } = await firstValueFrom(
      this.http.get<{ csrfToken: string }>('/api/reviewer/csrf', { withCredentials: true }),
    );
    return csrfToken;
  }

  async signIn(username: string, password: string, totpCode: string): Promise<SignInOutcome> {
    try {
      const csrfToken = await this.fetchCsrfToken();
      const result = await firstValueFrom(
        this.http.post<SignInResponse>(
          '/api/reviewer/session',
          { username, password, totpCode },
          { withCredentials: true, headers: { 'x-csrf-token': csrfToken } },
        ),
      );
      return { outcome: 'success', result };
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      if (status === 401) return { outcome: 'invalid_credentials' };
      if (status === 429) return { outcome: 'throttled' };
      return { outcome: 'unexpected' };
    }
  }

  async signOut(): Promise<void> {
    const csrfToken = await this.fetchCsrfToken();
    await firstValueFrom(
      this.http.delete('/api/reviewer/session', { withCredentials: true, headers: { 'x-csrf-token': csrfToken } }),
    );
  }
}
