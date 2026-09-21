import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  type ChangePasswordOutcome,
  ReviewerApi,
  type SessionInfo,
  type SignInOutcome,
} from './reviewer-api';
import { signInQueryFor } from './return-to';

/** The warning appears this long before the absolute ceiling. */
export const SESSION_WARNING_MS = 5 * 60 * 1000;

const SIGN_IN = '/reviewer/sign-in';

// What the page knows about the Reviewer's session, and the one clock it keeps:
// the absolute ceiling the server returned at sign-in. Nothing here watches
// idle time. The 1-hour sliding window is the server's; a page that tried to
// mirror it would have to guess which requests slid it.
@Injectable({ providedIn: 'root' })
export class ReviewerSession {
  private readonly api = inject(ReviewerApi);
  private readonly router = inject(Router);

  private readonly session = signal<SessionInfo | null>(null);
  readonly current = this.session.asReadonly();
  /** False until the first answer from the server, so a guard can wait. */
  readonly ready = signal(false);
  /** The T-5 toast. */
  readonly warning = signal(false);

  private warnTimer: ReturnType<typeof setTimeout> | undefined;
  private endTimer: ReturnType<typeof setTimeout> | undefined;

  async refresh(): Promise<void> {
    try {
      const check = await this.api.session();
      if (check.authenticated) this.hold(check);
      else this.clear();
    } catch {
      // Unreachable: no session can be shown, and the sign-in page says so.
      this.clear();
    }
    this.ready.set(true);
  }

  /** Waits for the first answer: it is also what hands the page its CSRF token. */
  async ensureReady(): Promise<void> {
    if (!this.ready()) await this.refresh();
  }

  async signIn(
    username: string,
    password: string,
    code: string,
  ): Promise<SignInOutcome> {
    const outcome = await this.api.signIn({ username, password, code });
    if (outcome.kind === 'ok') {
      this.hold(outcome.session);
      this.ready.set(true);
    }
    return outcome;
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
    code: string,
  ): Promise<ChangePasswordOutcome> {
    const outcome = await this.api.changePassword({
      currentPassword,
      newPassword,
      code,
    });
    const held = this.session();
    if (outcome.kind === 'ok' && held) {
      this.session.set({ ...held, mustChangePassword: false });
    }
    if (outcome.kind === 'session_ended') this.endedByServer();
    return outcome;
  }

  async signOut(): Promise<void> {
    await this.api.signOut();
    this.clear();
    // The Reviewer's own act: there is nothing to come back to.
    await this.router.navigate([SIGN_IN]);
  }

  /** "Sign in again now" on the warning: leave, and come back to this screen. */
  async signInAgain(): Promise<void> {
    const returnTo = signInQueryFor(this.router.url);
    await this.api.signOut();
    this.clear();
    await this.router.navigate(
      [SIGN_IN],
      'returnTo' in returnTo ? { queryParams: returnTo } : undefined,
    );
  }

  dismissWarning(): void {
    this.warning.set(false);
  }

  /** A call was refused because the session is gone. */
  endedByServer(): void {
    void this.sendToSignIn();
  }

  private hold(info: SessionInfo): void {
    this.cancelTimers();
    this.session.set(info);
    const ceiling = new Date(info.expiresAt).getTime();
    const untilEnd = ceiling - Date.now();
    const untilWarning = untilEnd - SESSION_WARNING_MS;

    if (untilEnd <= 0) {
      this.onCeiling();
      return;
    }
    if (untilWarning <= 0) this.warning.set(true);
    else {
      this.warnTimer = setTimeout(() => this.warning.set(true), untilWarning);
    }
    this.endTimer = setTimeout(() => this.onCeiling(), untilEnd);
  }

  private onCeiling(): void {
    // Ask the server too, so it records the expiry it now finds; the answer
    // changes nothing here.
    this.api.session().catch(() => undefined);
    void this.sendToSignIn();
  }

  private async sendToSignIn(): Promise<void> {
    const returnTo = signInQueryFor(this.router.url);
    this.clear();
    await this.router.navigate(
      [SIGN_IN],
      'returnTo' in returnTo ? { queryParams: returnTo } : undefined,
    );
  }

  private clear(): void {
    this.cancelTimers();
    this.session.set(null);
    this.warning.set(false);
  }

  private cancelTimers(): void {
    clearTimeout(this.warnTimer);
    clearTimeout(this.endTimer);
  }
}
