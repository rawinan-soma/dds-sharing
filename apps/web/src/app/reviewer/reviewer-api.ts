import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface SessionInfo {
  displayName: string;
  /** The absolute ceiling, from login. Never moves. */
  expiresAt: string;
  mustChangePassword: boolean;
}

export type SessionCheck =
  | ({ authenticated: true } & SessionInfo)
  | { authenticated: false; expired?: boolean };

export type SignInOutcome =
  | { kind: 'ok'; session: SessionInfo }
  // One outcome for every wrong factor: the screen never learns which.
  | { kind: 'failed' }
  | { kind: 'throttled'; retryAfterSeconds: number }
  | { kind: 'unavailable' };

/** The server's policy verdicts, keyed for the copy catalogue. */
export type PasswordViolation =
  | 'too_short'
  | 'too_long'
  | 'no_uppercase'
  | 'no_digit'
  | 'no_special'
  | 'same_as_current';

export type ChangePasswordOutcome =
  | { kind: 'ok' }
  | { kind: 'failed' }
  | { kind: 'policy'; violations: PasswordViolation[] }
  | { kind: 'throttled'; retryAfterSeconds: number }
  | { kind: 'session_ended' }
  | { kind: 'unavailable' };

const BASE = '/api/reviewer';

// The double-submit token rides on every state-changing call through Angular's
// XSRF support (see app.config.ts); nothing here handles it by hand.
@Injectable({ providedIn: 'root' })
export class ReviewerApi {
  private readonly http = inject(HttpClient);

  session(): Promise<SessionCheck> {
    return firstValueFrom(this.http.get<SessionCheck>(`${BASE}/session`));
  }

  async signIn(body: {
    username: string;
    password: string;
    code: string;
  }): Promise<SignInOutcome> {
    try {
      const session = await firstValueFrom(
        this.http.post<SessionInfo>(`${BASE}/sign-in`, body),
      );
      return { kind: 'ok', session };
    } catch (error) {
      if (!(error instanceof HttpErrorResponse)) return { kind: 'unavailable' };
      if (error.status === 401) return { kind: 'failed' };
      if (error.status === 429) return throttled(error);
      return { kind: 'unavailable' };
    }
  }

  async changePassword(body: {
    currentPassword: string;
    newPassword: string;
    code: string;
  }): Promise<ChangePasswordOutcome> {
    try {
      await firstValueFrom(this.http.post<void>(`${BASE}/password`, body));
      return { kind: 'ok' };
    } catch (error) {
      if (!(error instanceof HttpErrorResponse)) return { kind: 'unavailable' };
      const payload = error.error as {
        error?: string;
        violations?: PasswordViolation[];
      } | null;
      if (error.status === 422 && payload?.violations) {
        return { kind: 'policy', violations: payload.violations };
      }
      if (error.status === 429) return throttled(error);
      if (error.status === 401 && payload?.error === 'sign_in_failed') {
        return { kind: 'failed' };
      }
      if (error.status === 401) return { kind: 'session_ended' };
      return { kind: 'unavailable' };
    }
  }

  async signOut(): Promise<void> {
    try {
      await firstValueFrom(this.http.post<void>(`${BASE}/sign-out`, {}));
    } catch {
      // Already signed out is the goal; there is nothing further to do.
    }
  }
}

function throttled(error: HttpErrorResponse) {
  const body = error.error as { retryAfterSeconds?: number } | null;
  return {
    kind: 'throttled' as const,
    retryAfterSeconds: body?.retryAfterSeconds ?? 30,
  };
}
