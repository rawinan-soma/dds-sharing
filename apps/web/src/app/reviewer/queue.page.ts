import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { AlertPage } from './alert.page';
import { alertRaisedAgo, alertTitle } from './alert-copy';
import { DossierPage } from './dossier.page';
import { Icon } from './icon';
import {
  extractionTone,
  extractionWord,
  inFlightLinkCell,
} from './in-flight-copy';
import { InFlightPage } from './in-flight.page';
import { type AlertRow, type InFlightRow } from './queue-api';
import { LookupSearch } from './lookup-search';
import {
  formatDuration,
  formatShortInstant,
  minutesSince,
} from './queue-format';
import { QueueStore } from './queue-store';
import { ReviewerSession } from './reviewer-session';

// How often the staleness line re-reads the local clock. It asks the server for
// nothing: a page that polled would keep the session alive for ever, and an
// idle timeout that never fires is no timeout (§10.5).
const STALENESS_TICK_MS = 30_000;

type Zone = 'queue' | 'alerts' | 'in_flight';
const ZONES: readonly Zone[] = ['queue', 'alerts', 'in_flight'];

// The Reviewer's desk (system.md "The Reviewer screens, as locked"): one card,
// the queue band above (the three zones as tabs over one table) and the routed
// dossier below. A Request is in exactly one zone at a time (an open Alert
// takes it out of the in-flight list), and the table shows the selected zone
// only, so it appears in one place; each tab carries its count, so an open
// Alert is visible from the queue without a badge.
@Component({
  selector: 'app-reviewer-queue',
  imports: [Icon, LookupSearch, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="desk">
      <div class="desk-card">
        <header class="desk-header">
          <p class="brand">
            <span class="brand-name">{{ copy.brand }}</span>
            <span class="brand-surface">{{ copy.surface }}</span>
          </p>
          <div class="who">
            <span>{{ reviewerName() }}</span>
            <button class="sign-out" type="button" (click)="signOut()">
              {{ copy.signOut }}
            </button>
          </div>
        </header>

        <!-- The one screen a named human opens daily is the guaranteed reader
             of a stopped tick (spec §15.3): what it means, never an error code. -->
        @if (automaticProcessing() === 'stopped') {
          <section class="scheduler-stopped" role="alert">
            <h2>{{ copy.schedulerStoppedTitle }}</h2>
            <p>{{ copy.schedulerStoppedDetail }}</p>
          </section>
        }

        <section class="queue-band" [attr.aria-label]="copy.heading">
          <div class="band-row">
            <!-- One tab stop; arrow keys move between the zones. -->
            <div
              class="zone-tabs"
              role="tablist"
              [attr.aria-label]="copy.zones"
            >
              @for (zone of zones; track zone) {
                <button
                  type="button"
                  role="tab"
                  [id]="tabId(zone)"
                  aria-controls="zone-panel"
                  [attr.aria-selected]="zone === selected()"
                  [tabIndex]="zone === selected() ? 0 : -1"
                  [class.outstanding]="zone === 'alerts' && !!alerts()?.length"
                  (click)="select(zone)"
                  (keydown)="onTabKey($event)"
                >
                  {{ zoneLabel(zone) }}
                  @if (count(zone); as n) {
                    · <span class="figure">{{ n.value }}</span>
                  }
                </button>
              }
            </div>

            <div class="band-tools">
              <p
                class="staleness"
                [class.failed-text]="failed() && rows()"
                aria-live="polite"
              >
                @if (failed() && rows()) {
                  {{ copy.refreshFailed }} · {{ refreshFailedDetail() }}
                } @else if (loading() && rows()) {
                  {{ refreshStale() }}
                } @else if (rows()) {
                  {{ staleness() }}. {{ copy.noAutoRefresh }}
                }
              </p>
              <!-- Exact reference only (§10.10): the one way to a Request that
                   has left the surface. -->
              <app-lookup-search />
              <button
                class="btn btn-secondary refresh"
                type="button"
                [attr.aria-busy]="loading() || null"
                (click)="reload()"
              >
                <app-icon name="refresh" />
                {{ refreshLabel() }}
              </button>
            </div>
          </div>

          <div
            class="zone-panel"
            id="zone-panel"
            role="tabpanel"
            [attr.aria-labelledby]="tabId(selected())"
          >
            @if (failed() && !rows()) {
              <p class="panel-message failed-text" role="alert">
                {{ copy.loadFailed }}
              </p>
            } @else {
              @switch (selected()) {
                @case ('queue') {
                  @if (rows(); as list) {
                    @if (list.length) {
                      <table class="zone-table queue-table">
                        <colgroup>
                          <col class="w-220" />
                          <col />
                          <col class="w-180" />
                          <col class="w-160" />
                        </colgroup>
                        <thead>
                          <tr>
                            <th scope="col">{{ copy.colRequester }}</th>
                            <th scope="col">{{ copy.colGroup }}</th>
                            <th scope="col">{{ copy.colSubmitted }}</th>
                            <th scope="col">{{ copy.colTimeLeft }}</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (row of list; track row.id) {
                            <tr>
                              <th scope="row">
                                <a
                                  [routerLink]="[row.id]"
                                  routerLinkActive="selected"
                                  ariaCurrentWhenActive="page"
                                  >{{ row.requesterName }}</a
                                >
                              </th>
                              <td>{{ row.diseaseGroupName }}</td>
                              <td>
                                <time [attr.datetime]="row.submittedAt">{{
                                  shortInstant(row.submittedAt)
                                }}</time>
                              </td>
                              <td>
                                @if (row.expired) {
                                  <span class="tag pending">{{
                                    copy.expired
                                  }}</span>
                                } @else {
                                  <span
                                    class="figure"
                                    [class.leader]="row.id === leaderId()"
                                    >{{ duration(row.minutesLeft) }}</span
                                  >
                                }
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    } @else if (alerts()?.length) {
                      <!-- 12b: never says the desk is clear while an Alert is open. -->
                      <div class="empty-state">
                        <span class="status-mark pending" aria-hidden="true"
                          >!</span
                        >
                        <h2>{{ copy.alertsEmptyTitle }}</h2>
                        <p>{{ alertsEmptyCount() }}</p>
                        <button
                          class="btn btn-secondary"
                          type="button"
                          (click)="select('alerts')"
                        >
                          {{ copy.alertsEmptyAction }}
                        </button>
                      </div>
                    } @else {
                      <div class="empty-state">
                        <span class="status-mark success" aria-hidden="true">
                          <app-icon name="check" [size]="22" />
                        </span>
                        <h2>{{ copy.emptyTitle }}</h2>
                        <p>{{ copy.emptyDetail }}</p>
                        <p>{{ copy.emptyNote }}</p>
                      </div>
                    }
                  }
                }
                @case ('alerts') {
                  @if (alerts(); as list) {
                    @if (list.length) {
                      <table class="zone-table alerts-table">
                        <colgroup>
                          <col class="w-220" />
                          <col class="w-160" />
                          <col />
                          <col class="w-180" />
                          <col class="w-160" />
                        </colgroup>
                        <thead>
                          <tr>
                            <th scope="col">{{ copy.colKind }}</th>
                            <th scope="col">{{ copy.colRequest }}</th>
                            <th scope="col">{{ copy.colRequester }}</th>
                            <th scope="col">{{ copy.colAssigned }}</th>
                            <th scope="col">{{ copy.colRaised }}</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (
                            alert of list;
                            track alert.requestId + alert.kind
                          ) {
                            <tr>
                              <td class="kind">{{ alertTitle(alert.kind) }}</td>
                              <th scope="row" class="figure">
                                <a
                                  [routerLink]="['alerts', alert.requestId]"
                                  routerLinkActive="selected"
                                  ariaCurrentWhenActive="page"
                                  >{{ alert.reference }}</a
                                >
                              </th>
                              <td>{{ alert.requesterName }}</td>
                              <td>{{ alert.assignedTo.displayName }}</td>
                              <td>{{ raisedAgo(alert) }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    } @else {
                      <div class="empty-state">
                        <span class="status-mark success" aria-hidden="true">
                          <app-icon name="check" [size]="22" />
                        </span>
                        <h2>{{ copy.alertsZoneEmpty }}</h2>
                      </div>
                    }
                  }
                }
                @case ('in_flight') {
                  @if (inFlight(); as list) {
                    <p class="zone-note">{{ suppressionNote() }}</p>
                    @if (list.length) {
                      <table class="zone-table inflight-table">
                        <colgroup>
                          <col class="w-220" />
                          <col />
                          <col class="w-180" />
                          <col />
                        </colgroup>
                        <thead>
                          <tr>
                            <th scope="col">{{ copy.colRequest }}</th>
                            <th scope="col">{{ copy.colRequester }}</th>
                            <th scope="col">{{ copy.colState }}</th>
                            <th scope="col">{{ copy.colLink }}</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (entry of list; track entry.requestId) {
                            <tr>
                              <th scope="row" class="figure">
                                <a
                                  [routerLink]="['in-flight', entry.requestId]"
                                  routerLinkActive="selected"
                                  ariaCurrentWhenActive="page"
                                  >{{ entry.reference }}</a
                                >
                              </th>
                              <td>{{ entry.requesterName }}</td>
                              <td>
                                <span [class]="'tag ' + tone(entry)">{{
                                  stateWord(entry)
                                }}</span>
                              </td>
                              <td class="muted figure">
                                {{ linkCell(entry) }}
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    } @else {
                      <div class="empty-state">
                        <span class="status-mark inert" aria-hidden="true">
                          <app-icon name="check" [size]="22" />
                        </span>
                        <h2>{{ copy.inFlightZoneEmpty }}</h2>
                      </div>
                    }
                  }
                }
              }
            }
          </div>
        </section>

        <div class="dossier-slot">
          @if (rows()?.length && !dossierOpen()) {
            <p class="dossier-message muted">{{ copy.noneSelected }}</p>
          }
          <router-outlet
            (activate)="opened($event)"
            (deactivate)="dossierOpen.set(false)"
          />
        </div>
      </div>
    </div>
  `,
  styles: `
    .desk {
      padding: 48px;
    }
    .desk-card {
      max-width: 1344px;
      margin: 0 auto;
      background: var(--card);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-card);
      overflow: hidden;
    }
    /* Not dark: the Reviewer header is a card like the Requester's. */
    .desk-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 24px;
      padding: 16px 28px;
      border-bottom: 1px solid var(--border);
    }
    .brand {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .brand-name {
      font-size: 16px;
      font-weight: 600;
    }
    .brand-surface {
      font-size: 13px;
      color: var(--muted-foreground);
    }
    .who {
      display: flex;
      align-items: baseline;
      gap: 16px;
      font-size: 14px;
    }
    .sign-out {
      padding: 0;
      font: inherit;
      color: var(--primary);
      background: none;
      border: 0;
      cursor: pointer;
    }
    .sign-out:hover {
      text-decoration: underline;
    }
    .scheduler-stopped {
      padding: 16px 28px;
      background: var(--failed-wash);
      border-bottom: 2px solid var(--failed);
    }
    .scheduler-stopped h2 {
      font-size: 16px;
      font-weight: 600;
      color: var(--failed);
    }
    .scheduler-stopped p {
      max-width: 720px;
      margin-top: 4px;
    }
    .queue-band {
      padding: 20px 40px;
      background: var(--quiet);
      border-bottom: 1px solid var(--border);
    }
    .band-row {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px 24px;
      margin-bottom: 16px;
    }
    /* A segmented control: an inert-wash track, the selected tab a card. */
    .zone-tabs {
      display: inline-flex;
      gap: 4px;
      padding: 4px;
      background: var(--inert-wash);
      border-radius: var(--radius-md);
    }
    [role='tab'] {
      min-height: 36px;
      padding: 0 14px;
      font: inherit;
      font-size: 14px;
      color: var(--muted-foreground);
      background: transparent;
      border: 0;
      border-radius: var(--radius-sm);
      cursor: pointer;
      white-space: nowrap;
      transition: background-color 0.1s;
    }
    [role='tab']:hover {
      color: var(--foreground);
    }
    [role='tab'][aria-selected='true'] {
      color: var(--foreground);
      font-weight: 600;
      background: var(--card);
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
    }
    /* An open Alert is visible from any tab, in words and in ink. */
    [role='tab'].outstanding {
      color: var(--pending);
    }
    .band-tools {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-left: auto;
    }
    .staleness {
      max-width: 300px;
      padding-top: 10px;
      font-size: 12px;
      line-height: 1.5;
      color: var(--muted-foreground);
    }
    .staleness.failed-text {
      color: var(--failed);
    }
    .refresh {
      flex: none;
    }
    .zone-panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    .zone-note {
      padding: 10px 20px;
      font-size: 12px;
      color: var(--muted-foreground);
      border-bottom: 1px solid var(--border);
    }
    .panel-message {
      padding: 24px 20px;
    }
    .w-220 {
      width: 220px;
    }
    .w-180 {
      width: 180px;
    }
    .w-160 {
      width: 160px;
    }
    /* Each row is its link: the link in the row header stretches over the
       row, so the whole row is the target and the link is its one tab stop. */
    tbody tr {
      position: relative;
    }
    tbody tr:hover {
      background: var(--quiet);
    }
    tbody th a {
      color: inherit;
      text-decoration: none;
    }
    tbody th a::after {
      content: '';
      position: absolute;
      inset: 0;
    }
    tbody th a:focus-visible {
      outline: none;
    }
    tbody tr:has(a:focus-visible) {
      outline: 2px solid var(--primary);
      outline-offset: -2px;
    }
    /* The selected row: the dossier below is this one. */
    tbody tr:has(a.selected) {
      background: var(--primary-wash);
      box-shadow: inset 3px 0 0 var(--primary);
    }
    tbody tr:has(a.selected) th {
      font-weight: 600;
    }
    .alerts-table tbody tr:has(a.selected) {
      background: var(--pending-wash);
      box-shadow: inset 3px 0 0 var(--pending);
    }
    .kind {
      font-weight: 600;
      color: var(--pending);
    }
    /* The oldest Request's clock: the text states the hours, the ink only
       repeats it (accessibility.md P4). */
    .leader {
      color: var(--pending);
      font-weight: 600;
    }
  `,
})
export class QueuePage {
  private readonly store = inject(QueueStore);
  private readonly session = inject(ReviewerSession);

  protected readonly zones = ZONES;
  protected readonly rows = this.store.rows;
  protected readonly alerts = this.store.alerts;
  protected readonly inFlight = this.store.inFlight;
  protected readonly loading = this.store.loading;
  protected readonly failed = this.store.failed;
  protected readonly automaticProcessing = this.store.automaticProcessing;
  // Whether the routed dossier (the child route) currently has a Request open.
  protected readonly dossierOpen = signal(false);
  protected readonly selected = signal<Zone>('queue');
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
    brand: m.reviewer_brand(),
    surface: m.reviewer_surface(),
    heading: m.reviewer_queue_heading(),
    zones: m.reviewer_zones_label(),
    refresh: m.reviewer_queue_refresh(),
    refreshLoading: m.reviewer_queue_refresh_loading(),
    refreshRetry: m.reviewer_queue_retry(),
    refreshFailed: m.reviewer_queue_refresh_failed(),
    loadFailed: m.reviewer_queue_load_failed(),
    noAutoRefresh: m.reviewer_queue_no_autorefresh(),
    signOut: m.reviewer_signout(),
    expired: m.reviewer_clock_expired(),
    noneSelected: m.reviewer_dossier_none_selected(),
    colRequester: m.reviewer_col_requester(),
    colGroup: m.reviewer_dossier_group(),
    colSubmitted: m.reviewer_col_submitted(),
    colTimeLeft: m.reviewer_col_time_left(),
    colKind: m.reviewer_col_kind(),
    colRequest: m.reviewer_col_request(),
    colAssigned: m.reviewer_col_assigned(),
    colRaised: m.reviewer_col_raised(),
    colState: m.reviewer_col_state(),
    colLink: m.reviewer_col_link(),
    emptyTitle: m.reviewer_empty_clear_title(),
    emptyDetail: m.reviewer_empty_clear_detail(),
    emptyNote: m.reviewer_empty_clear_note(),
    alertsEmptyTitle: m.reviewer_empty_alerts_title(),
    alertsEmptyAction: m.reviewer_empty_alerts_action(),
    alertsZoneEmpty: m.reviewer_zone_alerts_empty(),
    inFlightZoneEmpty: m.reviewer_zone_inflight_empty(),
    schedulerStoppedTitle: m.reviewer_scheduler_stopped_title(),
    schedulerStoppedDetail: m.reviewer_scheduler_stopped_detail(),
  };

  constructor() {
    const tick = setInterval(() => this.now.set(Date.now()), STALENESS_TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
    void this.reload();
  }

  protected reviewerName = () => this.session.current()?.displayName ?? '';

  protected tabId = (zone: Zone) => `zone-tab-${zone}`;

  protected zoneLabel(zone: Zone): string {
    switch (zone) {
      case 'queue':
        return m.reviewer_zone_queue();
      case 'alerts':
        return m.reviewer_alerts_heading();
      case 'in_flight':
        return m.reviewer_inflight_heading();
    }
  }

  /** Boxed, so a zero count still renders; null until the first list. */
  protected count(zone: Zone): { value: number } | null {
    const list =
      zone === 'queue'
        ? this.rows()
        : zone === 'alerts'
          ? this.alerts()
          : this.inFlight();
    return list ? { value: list.length } : null;
  }

  protected select(zone: Zone): void {
    this.selected.set(zone);
  }

  /** Selection follows focus across the tabs, wrapping at either end. */
  protected onTabKey(event: KeyboardEvent): void {
    const last = ZONES.length - 1;
    const at = ZONES.indexOf(this.selected());
    const next =
      event.key === 'ArrowRight'
        ? at === last
          ? 0
          : at + 1
        : event.key === 'ArrowLeft'
          ? at === 0
            ? last
            : at - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    this.selected.set(ZONES[next]);
    const tablist = (event.currentTarget as HTMLElement).parentElement;
    tablist?.querySelectorAll<HTMLElement>('[role=tab]')[next]?.focus();
  }

  /** Selection follows the dossier: an opened Request shows its own zone. */
  protected opened(page: unknown): void {
    this.dossierOpen.set(true);
    if (page instanceof DossierPage) this.selected.set('queue');
    else if (page instanceof AlertPage) this.selected.set('alerts');
    else if (page instanceof InFlightPage) this.selected.set('in_flight');
  }

  protected refreshLabel(): string {
    if (this.loading()) return this.copy.refreshLoading;
    return this.failed() ? this.copy.refreshRetry : this.copy.refresh;
  }

  protected alertTitle = alertTitle;
  protected alertsEmptyCount = () =>
    m.reviewer_empty_alerts_count({ count: this.alerts()?.length ?? 0 });
  protected suppressionNote = () =>
    m.reviewer_inflight_suppression_note({
      count: this.alerts()?.length ?? 0,
    });
  protected raisedAgo = (alert: AlertRow) => alertRaisedAgo(alert, this.now());
  protected duration = formatDuration;
  protected shortInstant = formatShortInstant;
  protected stateWord = (entry: InFlightRow) =>
    extractionWord(entry.extraction);
  protected tone = (entry: InFlightRow) => extractionTone(entry.extraction);
  protected linkCell = (entry: InFlightRow) =>
    inFlightLinkCell(entry, this.now());

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
