import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { type QueueRow } from './queue-api';
import { formatDuration, minutesSince } from './queue-format';
import { QueueStore } from './queue-store';
import { ReviewerSession } from './reviewer-session';

// How often the staleness line re-reads the local clock. It asks the server for
// nothing: a page that polled would keep the session alive for ever, and an
// idle timeout that never fires is no timeout (§10.5).
const STALENESS_TICK_MS = 30_000;

// The split queue (§10.1): the list on the left, the Request on the right. Only
// the Queue zone is built here. The Alerts zone (#73) and the In-progress zone
// (#74) are sibling landmarks in the sidebar, below this one, and a Request is
// in exactly one zone at a time — so adding them needs no rework of this one.
@Component({
  selector: 'app-reviewer-queue',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="desk">
      <header class="bar">
        <p class="who">{{ signedInAs() }}</p>
        <button class="btn btn-quiet" type="button" (click)="signOut()">
          {{ copy.signOut }}
        </button>
      </header>

      <div class="split">
        <aside class="sidebar">
          <div class="side-head">
            <h1>{{ copy.heading }}</h1>
            @if (rows(); as list) {
              <p class="count figure">
                {{ countLabel(list.length) }}
              </p>
            }
            <button
              class="btn btn-secondary btn-full refresh"
              type="button"
              [attr.aria-busy]="loading() || null"
              (click)="reload()"
            >
              {{ loading() ? copy.refreshLoading : copy.refresh }}
            </button>
            <div class="staleness" aria-live="polite">
              @if (failed() && rows()) {
                <p class="failed-text">{{ copy.refreshFailed }}</p>
                <p>{{ refreshFailedDetail() }}</p>
              } @else if (loading() && rows()) {
                <p>{{ refreshStale() }}</p>
              } @else if (rows()) {
                <p>{{ staleness() }}</p>
              }
            </div>
            <p class="note muted">{{ copy.noAutoRefresh }}</p>
          </div>

          <nav [attr.aria-label]="copy.heading">
            @if (rows(); as list) {
              <ul class="plain-list">
                @for (row of list; track row.id) {
                  <li>
                    <a
                      class="row"
                      [routerLink]="[row.id]"
                      routerLinkActive="selected"
                      ariaCurrentWhenActive="page"
                    >
                      <span class="ref figure">{{ row.reference }}</span>
                      <span class="name">{{ row.requesterName }}</span>
                      <span class="group muted">{{
                        row.diseaseGroupName
                      }}</span>
                      @if (row.expired) {
                        <span class="tag">{{ copy.expired }}</span>
                      } @else {
                        <span
                          class="left figure"
                          [class.leader]="row.id === leaderId()"
                          >{{ timeLeft(row) }}</span
                        >
                      }
                    </a>
                  </li>
                }
              </ul>
            }
          </nav>
        </aside>

        <main class="pane">
          @if (failed() && !rows()) {
            <p class="empty failed-text" role="alert">
              {{ copy.loadFailed }}
            </p>
          } @else if (rows()?.length === 0) {
            <section class="empty">
              <p class="kicker-line">{{ copy.emptyKicker }}</p>
              <h2>{{ copy.emptyTitle }}</h2>
              <p class="prose">{{ copy.emptyDetail }}</p>
              <p class="prose muted">{{ copy.emptyNote }}</p>
            </section>
          } @else if (rows() && !dossierOpen()) {
            <p class="empty muted">{{ copy.noneSelected }}</p>
          }
          <router-outlet
            (activate)="dossierOpen.set(true)"
            (deactivate)="dossierOpen.set(false)"
          />
        </main>
      </div>
    </div>
  `,
  styles: `
    .desk {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 24px;
      background: var(--card);
      border-bottom: 1px solid var(--border-strong);
    }
    .who {
      font-weight: 600;
    }
    .split {
      flex: 1;
      display: grid;
      grid-template-columns: 372px minmax(0, 1fr);
      align-items: start;
    }
    .sidebar {
      background: var(--card);
      border-right: 1px solid var(--border);
      min-height: 100%;
      align-self: stretch;
    }
    .side-head {
      padding: 20px;
      border-bottom: 1px solid var(--border);
    }
    h1 {
      font-size: 1.25rem;
      font-weight: 600;
    }
    .count {
      margin: 4px 0 12px;
      color: var(--muted-foreground);
    }
    .staleness {
      margin-top: 8px;
      font-size: 0.875rem;
      color: var(--muted-foreground);
    }
    .staleness .failed-text {
      font-weight: 600;
    }
    .note {
      margin-top: 8px;
      font-size: 0.875rem;
    }
    .muted {
      color: var(--muted-foreground);
    }
    .plain-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .plain-list li {
      border-bottom: 1px solid var(--border);
      padding: 0;
      margin: 0;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 2px 12px;
      padding: 16px 20px;
      color: inherit;
      text-decoration: none;
      border-left: 2px solid transparent;
    }
    .row:hover {
      background: var(--land);
    }
    .row.selected {
      background: var(--primary-wash);
      border-left-color: var(--primary);
    }
    .row.selected .ref {
      color: var(--primary);
    }
    .ref {
      font-weight: 600;
    }
    .name,
    .group {
      grid-column: 1;
      font-size: 0.875rem;
    }
    .left,
    .tag {
      grid-column: 2;
      grid-row: 1;
      font-size: 0.875rem;
      color: var(--muted-foreground);
    }
    .left.leader {
      color: var(--pending);
      font-weight: 600;
    }
    .tag {
      color: var(--failed);
      font-weight: 600;
    }
    .pane {
      min-width: 0;
    }
    .empty {
      padding: 32px 40px;
    }
    .prose {
      max-width: 720px;
      margin-top: 12px;
    }
    .kicker-line {
      color: var(--muted-foreground);
      font-size: 0.875rem;
    }
    .empty h2 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-top: 4px;
    }
  `,
})
export class QueuePage {
  private readonly store = inject(QueueStore);
  private readonly session = inject(ReviewerSession);

  protected readonly rows = this.store.rows;
  protected readonly loading = this.store.loading;
  protected readonly failed = this.store.failed;
  // Whether the routed dossier (the child route) currently has a Request open.
  protected readonly dossierOpen = signal(false);
  private readonly changes = this.store.changes;
  private readonly loadedAt = this.store.loadedAt;
  private readonly now = signal(Date.now());

  protected readonly leaderId = computed(
    () => this.rows()?.find((r) => !r.expired)?.id ?? null,
  );

  private readonly staleMinutes = computed(() =>
    minutesSince(this.loadedAt(), this.now()),
  );

  protected readonly copy = {
    heading: m.reviewer_queue_heading(),
    refresh: m.reviewer_queue_refresh(),
    refreshLoading: m.reviewer_queue_refresh_loading(),
    refreshFailed: m.reviewer_queue_refresh_failed(),
    loadFailed: m.reviewer_queue_load_failed(),
    noAutoRefresh: m.reviewer_queue_no_autorefresh(),
    signOut: m.reviewer_signout(),
    expired: m.reviewer_clock_expired(),
    noneSelected: m.reviewer_dossier_none_selected(),
    emptyKicker: m.reviewer_empty_clear_kicker(),
    emptyTitle: m.reviewer_empty_clear_title(),
    emptyDetail: m.reviewer_empty_clear_detail(),
    emptyNote: m.reviewer_empty_clear_note(),
  };

  constructor() {
    const tick = setInterval(() => this.now.set(Date.now()), STALENESS_TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
    void this.reload();
  }

  protected signedInAs = () =>
    m.reviewer_signed_in_as({
      reviewer: this.session.current()?.displayName ?? '',
    });

  protected countLabel = (count: number) => m.reviewer_queue_count({ count });
  protected timeLeft = (row: QueueRow) =>
    m.reviewer_time_left({
      time: formatDuration(row.minutesLeft),
    });

  protected staleness = () =>
    m.reviewer_queue_staleness({
      minutes: this.staleMinutes(),
      changes: this.changes(),
    });
  protected refreshStale = () =>
    m.reviewer_queue_refresh_stale({ minutes: this.staleMinutes() });
  protected refreshFailedDetail = () =>
    m.reviewer_queue_refresh_failed_detail({ minutes: this.staleMinutes() });

  protected signOut(): Promise<void> {
    return this.session.signOut();
  }

  /** The only way the list is read again: the Reviewer asks for it. */
  protected async reload(): Promise<void> {
    if (this.loading()) return;
    await this.store.reload();
    this.now.set(Date.now());
  }
}
