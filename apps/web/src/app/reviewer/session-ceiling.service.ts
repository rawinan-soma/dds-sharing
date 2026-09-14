import { Injectable, signal } from '@angular/core';

const WARNING_LEAD_MS = 5 * 60 * 1000;

/**
 * Times the reviewer session's absolute ceiling (spec §17.5): a non-blocking
 * warning five minutes before it, and an expiry callback when it's reached.
 * Deliberately time-since-login only — the separate 1-hour idle window is
 * enforced server-side and has no client-side timer here.
 */
@Injectable({ providedIn: 'root' })
export class SessionCeilingService {
  private warningTimer?: ReturnType<typeof setTimeout>;
  private expiryTimer?: ReturnType<typeof setTimeout>;

  readonly warningVisible = signal(false);

  start(absoluteExpiresAt: string, onExpire: () => void): void {
    this.stop();

    const msUntilExpiry = new Date(absoluteExpiresAt).getTime() - Date.now();
    const msUntilWarning = msUntilExpiry - WARNING_LEAD_MS;

    if (msUntilWarning <= 0) {
      this.warningVisible.set(true);
    } else {
      this.warningTimer = setTimeout(() => this.warningVisible.set(true), msUntilWarning);
    }

    this.expiryTimer = setTimeout(
      () => {
        this.warningVisible.set(false);
        onExpire();
      },
      Math.max(msUntilExpiry, 0),
    );
  }

  stop(): void {
    clearTimeout(this.warningTimer);
    clearTimeout(this.expiryTimer);
    this.warningVisible.set(false);
  }
}
