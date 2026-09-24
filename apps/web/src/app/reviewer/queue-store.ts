import { Injectable, inject, signal } from '@angular/core';
import {
  type AlertKind,
  type AlertRow,
  type InFlightRow,
  type QueueList,
  type QueueRow,
  QueueApi,
} from './queue-api';
import { countChanges } from './queue-format';

/**
 * The pending list's one copy of the truth, shared by the queue sidebar and
 * the dossier routed beside it. A Decision drops its Request out of the list
 * locally (§10.3: "in the same response"), never by asking the server again —
 * the queue does not auto-refresh, and a Decision is not the exception.
 */
@Injectable({ providedIn: 'root' })
export class QueueStore {
  private readonly api = inject(QueueApi);

  /** Null until the first list arrives. Kept, never blanked, while a reload runs. */
  readonly rows = signal<QueueRow[] | null>(null);
  /** The must-clear items (§10.6), read with the rows and never on their own. */
  readonly alerts = signal<AlertRow[] | null>(null);
  /** Approved and not yet terminal (§10.9), read with the rows too. */
  readonly inFlight = signal<InFlightRow[] | null>(null);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly loadedAt = signal(0);
  readonly changes = signal(0);
  /** As of the last read, like the rows: the page never polls for it either. */
  readonly automaticProcessing =
    signal<QueueList['automaticProcessing']>('running');

  /** The only way the list is read again: the Reviewer asks for it. */
  async reload(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.failed.set(false);
    try {
      const list = await this.api.list();
      const before = this.rows();
      this.changes.set(before ? countChanges(before, list.requests) : 0);
      this.rows.set(list.requests);
      this.alerts.set(list.alerts);
      this.inFlight.set(list.inFlight);
      this.automaticProcessing.set(list.automaticProcessing);
      this.loadedAt.set(Date.now());
    } catch {
      // The old list stays on screen, and the staleness line says how old it is.
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** An Alert was cleared: its card leaves the zone, without a re-read. */
  removeAlert(requestId: string, kind: AlertKind): void {
    const alerts = this.alerts();
    if (alerts) {
      this.alerts.set(
        alerts.filter((a) => a.requestId !== requestId || a.kind !== kind),
      );
    }
  }

  /** Something pressed on an in-flight Request changed how its row reads. */
  updateInFlight(requestId: string, change: Partial<InFlightRow>): void {
    const rows = this.inFlight();
    if (rows) {
      this.inFlight.set(
        rows.map((r) => (r.requestId === requestId ? { ...r, ...change } : r)),
      );
    }
  }

  /** The Request has left the in-flight list: finished, or now an Alert. */
  removeInFlight(requestId: string): void {
    const rows = this.inFlight();
    if (rows) this.inFlight.set(rows.filter((r) => r.requestId !== requestId));
  }

  /** A Decision landed on this Request: it is no longer pending. */
  removePending(id: string): void {
    const rows = this.rows();
    if (rows) this.rows.set(rows.filter((r) => r.id !== id));
  }
}
