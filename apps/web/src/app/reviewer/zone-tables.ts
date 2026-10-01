import { Component, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { alertRaisedAgo, alertTitle } from './alert-copy';
import { EmptyState } from './empty-state';
import {
  extractionTone,
  extractionWord,
  inFlightLinkCell,
} from './in-flight-copy';
import { type AlertRow, type InFlightRow } from './queue-api';
import { formatDuration, formatShortInstant } from './queue-format';
import { QueueStore } from './queue-store';
import { Tag } from './tag';

// The three zones' tables (system.md screen 5, 6a, 6b), one component each,
// shown one at a time in the queue band's tabpanel. Each row is headed by a
// link to its dossier; the global `.zone-table.linked` rules stretch that link
// over the row, so the whole row is the target and the link its one tab stop.
// Each zone says so in place of its table when it is empty, never beside it.

/** Pending Requests, oldest first (§10.1). */
@Component({
  selector: 'app-queue-zone',
  imports: [EmptyState, RouterLink, RouterLinkActive, Tag],
  template: `
    @if (store.rows(); as list) {
      @if (list.length) {
        <table class="zone-table linked">
          <colgroup>
            <col class="w-220" />
            <col />
            <col class="w-180" />
            <col class="w-160" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{{ copy.requester }}</th>
              <th scope="col">{{ copy.group }}</th>
              <th scope="col">{{ copy.submitted }}</th>
              <th scope="col">{{ copy.timeLeft }}</th>
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
                    <app-tag tone="pending">{{ copy.expired }}</app-tag>
                  } @else {
                    <span class="figure">{{ duration(row.minutesLeft) }}</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      } @else if (store.alerts()?.length) {
        <!-- 12b: never says the desk is clear while an Alert is open. -->
        <app-empty-state tone="pending" [title]="copy.alertsOpenTitle">
          <p>{{ alertsOpenCount() }}</p>
          <button
            class="btn btn-secondary"
            type="button"
            (click)="showAlerts.emit()"
          >
            {{ copy.alertsOpenAction }}
          </button>
        </app-empty-state>
      } @else {
        <app-empty-state tone="success" [title]="copy.clearTitle">
          <p>{{ copy.clearDetail }}</p>
          <p>{{ copy.clearNote }}</p>
        </app-empty-state>
      }
    }
  `,
})
export class QueueZone {
  protected readonly store = inject(QueueStore);
  /** 12b's one action: open the Alerts zone. */
  readonly showAlerts = output<void>();

  protected readonly copy = {
    requester: m.reviewer_col_requester(),
    group: m.reviewer_dossier_group(),
    submitted: m.reviewer_col_submitted(),
    timeLeft: m.reviewer_col_time_left(),
    expired: m.reviewer_clock_expired(),
    clearTitle: m.reviewer_empty_clear_title(),
    clearDetail: m.reviewer_empty_clear_detail(),
    clearNote: m.reviewer_empty_clear_note(),
    alertsOpenTitle: m.reviewer_empty_alerts_title(),
    alertsOpenAction: m.reviewer_empty_alerts_action(),
  };

  protected alertsOpenCount = () =>
    m.reviewer_empty_alerts_count({ count: this.store.alerts()?.length ?? 0 });
  protected duration = formatDuration;
  protected shortInstant = formatShortInstant;
}

/** Must-clear items (§10.6), the selected row in pending, not primary. */
@Component({
  selector: 'app-alerts-zone',
  imports: [EmptyState, RouterLink, RouterLinkActive],
  template: `
    @if (store.alerts(); as list) {
      @if (list.length) {
        <table class="zone-table linked alerts">
          <colgroup>
            <col class="w-220" />
            <col class="w-160" />
            <col />
            <col class="w-180" />
            <col class="w-160" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{{ copy.kind }}</th>
              <th scope="col">{{ copy.request }}</th>
              <th scope="col">{{ copy.requester }}</th>
              <th scope="col">{{ copy.assigned }}</th>
              <th scope="col">{{ copy.raised }}</th>
            </tr>
          </thead>
          <tbody>
            @for (alert of list; track alert.requestId + alert.kind) {
              <tr>
                <td class="kind">{{ title(alert) }}</td>
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
        <app-empty-state tone="success" [title]="copy.empty" />
      }
    }
  `,
  styles: `
    .kind {
      font-weight: 600;
      color: var(--pending);
    }
  `,
})
export class AlertsZone {
  protected readonly store = inject(QueueStore);
  /** The page's clock reading, so the whole band ticks together. */
  readonly now = input.required<number>();

  protected readonly copy = {
    kind: m.reviewer_col_kind(),
    request: m.reviewer_col_request(),
    requester: m.reviewer_col_requester(),
    assigned: m.reviewer_col_assigned(),
    raised: m.reviewer_col_raised(),
    empty: m.reviewer_zone_alerts_empty(),
  };

  protected title = (alert: AlertRow) => alertTitle(alert.kind);
  protected raisedAgo = (alert: AlertRow) => alertRaisedAgo(alert, this.now());
}

/** Approved and not yet terminal (§10.9), in submit order. */
@Component({
  selector: 'app-in-flight-zone',
  imports: [EmptyState, RouterLink, RouterLinkActive, Tag],
  template: `
    @if (store.inFlight(); as list) {
      <p class="zone-note">{{ suppressionNote() }}</p>
      @if (list.length) {
        <table class="zone-table linked">
          <colgroup>
            <col class="w-220" />
            <col />
            <col class="w-180" />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{{ copy.request }}</th>
              <th scope="col">{{ copy.requester }}</th>
              <th scope="col">{{ copy.state }}</th>
              <th scope="col">{{ copy.link }}</th>
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
                @if (isLocal(entry)) {
                  <!-- Approved on this screen: its state is the server's to
                       say, on the next refresh, never a guess. -->
                  <td>
                    <app-tag tone="inert">{{ copy.justApproved }}</app-tag>
                  </td>
                  <td class="muted">{{ copy.localNote }}</td>
                } @else {
                  <td>
                    <app-tag [tone]="tone(entry)">{{
                      stateWord(entry)
                    }}</app-tag>
                  </td>
                  <td class="muted figure">{{ linkCell(entry) }}</td>
                }
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <app-empty-state tone="inert" [title]="copy.empty" />
      }
    }
  `,
  styles: `
    .zone-note {
      padding: 10px 20px;
      font-size: 12px;
      color: var(--muted-foreground);
      border-bottom: 1px solid var(--border);
    }
  `,
})
export class InFlightZone {
  protected readonly store = inject(QueueStore);
  /** The page's clock reading, so the whole band ticks together. */
  readonly now = input.required<number>();

  protected readonly copy = {
    request: m.reviewer_col_request(),
    requester: m.reviewer_col_requester(),
    state: m.reviewer_col_state(),
    link: m.reviewer_col_link(),
    justApproved: m.reviewer_state_just_approved(),
    localNote: m.reviewer_inflight_local_note(),
    empty: m.reviewer_zone_inflight_empty(),
  };

  protected suppressionNote = () =>
    m.reviewer_inflight_suppression_note({
      count: this.store.alerts()?.length ?? 0,
    });
  protected isLocal = (entry: InFlightRow) =>
    this.store.localInFlight().has(entry.requestId);
  protected stateWord = (entry: InFlightRow) =>
    extractionWord(entry.extraction);
  protected tone = (entry: InFlightRow) => extractionTone(entry.extraction);
  protected linkCell = (entry: InFlightRow) =>
    inFlightLinkCell(entry, this.now());
}
