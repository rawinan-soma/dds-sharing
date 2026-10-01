import {
  Component,
  DestroyRef,
  type Signal,
  type Type,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { AlertPage } from './alert.page';
import { DossierPage } from './dossier.page';
import { Icon } from './icon';
import { InFlightPage } from './in-flight.page';
import { LookupSearch } from './lookup-search';
import { minutesSince } from './queue-format';
import { QueueStore } from './queue-store';
import { ReviewerSession } from './reviewer-session';
import { AlertsZone, InFlightZone, QueueZone } from './zone-tables';

// How often the staleness line re-reads the local clock. It asks the server for
// nothing: a page that polled would keep the session alive for ever, and an
// idle timeout that never fires is no timeout (§10.5).
const STALENESS_TICK_MS = 30_000;

/** Also the zone's value in the `?zone=` address, as the 11c link writes it. */
type ZoneId = 'queue' | 'alerts' | 'in-flight';

/** One zone of the surface: its tab, its rows, its dossier, its address. */
interface Zone {
  id: ZoneId;
  label: () => string;
  rows: (store: QueueStore) => Signal<readonly unknown[] | null>;
  /** The routed dossier that belongs to this zone. */
  page: Type<unknown>;
}

const ZONES: readonly Zone[] = [
  {
    id: 'queue',
    label: () => m.reviewer_zone_queue(),
    rows: (store) => store.rows,
    page: DossierPage,
  },
  {
    id: 'alerts',
    label: () => m.reviewer_alerts_heading(),
    rows: (store) => store.alerts,
    page: AlertPage,
  },
  {
    id: 'in-flight',
    label: () => m.reviewer_inflight_heading(),
    rows: (store) => store.inFlight,
    page: InFlightPage,
  },
];

// The Reviewer's desk (system.md "The Reviewer screens, as locked"): one card,
// the queue band above (the three zones as tabs over one table) and the routed
// dossier below. A Request is in exactly one zone at a time (an open Alert
// takes it out of the in-flight list), and the tabpanel shows the selected
// zone only, so it appears in one place; each tab carries its count, so an
// open Alert is visible from the queue without a badge.
//
// The selected zone follows, in order: a tab pressed here; `?zone=` in the
// address (the 11c link); and otherwise the zone of the dossier opened.
@Component({
  selector: 'app-reviewer-queue',
  imports: [
    AlertsZone,
    Icon,
    InFlightZone,
    LookupSearch,
    QueueZone,
    RouterOutlet,
  ],
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
              @for (zone of zones; track zone.id; let at = $index) {
                <button
                  type="button"
                  role="tab"
                  [id]="tabId(zone.id)"
                  aria-controls="zone-panel"
                  [attr.aria-selected]="zone.id === selected()"
                  [tabIndex]="zone.id === selected() ? 0 : -1"
                  [class.outstanding]="
                    zone.id === 'alerts' && !!alerts()?.length
                  "
                  (click)="select(zone.id)"
                  (keydown)="onTabKey($event, at)"
                >
                  {{ zone.label() }}
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
                  <app-queue-zone (showAlerts)="select('alerts')" />
                }
                @case ('alerts') {
                  <app-alerts-zone [now]="now()" />
                }
                @case ('in-flight') {
                  <app-in-flight-zone [now]="now()" />
                }
              }
            }
          </div>
        </section>

        <div>
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
      box-shadow: var(--shadow-segment);
    }
    /* An open Alert is visible from any tab, in words and in ink. */
    [role='tab'].outstanding {
      color: var(--pending);
    }
    /* The lookup is a Field, its box one label row (14px at 1.65) and the
       Field's 6px gap down; the line and refresh are centred on that box. */
    .band-tools {
      --box-top: calc(14px * 1.65 + 6px);
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-left: auto;
    }
    /* Two 12px lines at 1.5 (36px) in the 44px box. */
    .staleness {
      max-width: 300px;
      padding-top: calc(var(--box-top) + 4px);
      font-size: 12px;
      line-height: 1.5;
      color: var(--muted-foreground);
    }
    .staleness.failed-text {
      color: var(--failed);
    }
    /* The 40px button in the 44px box. */
    .refresh {
      flex: none;
      margin-top: calc(var(--box-top) + 2px);
    }
    .zone-panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    .panel-message {
      padding: 24px 20px;
    }
  `,
})
export class QueuePage {
  private readonly store = inject(QueueStore);
  private readonly session = inject(ReviewerSession);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly zones = ZONES;
  protected readonly rows = this.store.rows;
  protected readonly alerts = this.store.alerts;
  protected readonly loading = this.store.loading;
  protected readonly failed = this.store.failed;
  protected readonly automaticProcessing = this.store.automaticProcessing;
  // Whether the routed dossier (the child route) currently has a Request open.
  protected readonly dossierOpen = signal(false);
  protected readonly selected = signal<ZoneId>('queue');
  protected readonly now = signal(Date.now());
  private readonly changes = this.store.changes;
  private readonly loadedAt = this.store.loadedAt;

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
    noneSelected: m.reviewer_dossier_none_selected(),
    schedulerStoppedTitle: m.reviewer_scheduler_stopped_title(),
    schedulerStoppedDetail: m.reviewer_scheduler_stopped_detail(),
  };

  constructor() {
    const destroyRef = inject(DestroyRef);
    const tick = setInterval(() => this.now.set(Date.now()), STALENESS_TICK_MS);
    destroyRef.onDestroy(() => clearInterval(tick));
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((params) => {
        const zone = ZONES.find((z) => z.id === params.get('zone'));
        if (zone) this.selected.set(zone.id);
      });
    void this.reload();
  }

  protected reviewerName = () => this.session.current()?.displayName ?? '';

  protected tabId = (zone: ZoneId) => `zone-tab-${zone}`;

  /** Boxed, so a zero count still renders; null until the first list. */
  protected count(zone: Zone): { value: number } | null {
    const list = zone.rows(this.store)();
    return list ? { value: list.length } : null;
  }

  /**
   * A tab pressed here wins, and drops any `?zone=` the address carried, so
   * pressing the 11c link again later still moves the tab.
   */
  protected select(zone: ZoneId): void {
    this.selected.set(zone);
    if (this.route.snapshot.queryParamMap.has('zone')) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { zone: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  /** Selection follows focus across the tabs, wrapping at either end. */
  protected onTabKey(event: KeyboardEvent, at: number): void {
    const last = ZONES.length - 1;
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
    this.select(ZONES[next].id);
    const tablist = (event.currentTarget as HTMLElement).parentElement;
    tablist?.querySelectorAll<HTMLElement>('[role=tab]')[next]?.focus();
  }

  /**
   * Selection follows the dossier: an opened Request shows its own zone,
   * unless the address names one.
   */
  protected opened(page: unknown): void {
    this.dossierOpen.set(true);
    if (this.route.snapshot.queryParamMap.has('zone')) return;
    const zone = ZONES.find((z) => page instanceof z.page);
    if (zone) this.selected.set(zone.id);
  }

  protected refreshLabel(): string {
    if (this.loading()) return this.copy.refreshLoading;
    return this.failed() ? this.copy.refreshRetry : this.copy.refresh;
  }

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
