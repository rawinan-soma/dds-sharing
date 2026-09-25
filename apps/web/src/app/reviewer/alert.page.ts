import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import {
  alertAssignedTo,
  alertRaisedAgo,
  alertTitle,
  outcomeLabel,
} from './alert-copy';
import {
  type AlertDetail,
  type AlertDetailOutcome,
  type AlertOutcome,
  type AlertRow,
  QueueApi,
} from './queue-api';
import { QueueStore } from './queue-store';

type View =
  | { kind: 'loading' }
  | { kind: 'ok'; detail: AlertDetail }
  | Exclude<AlertDetailOutcome, { kind: 'ok' }>;

// What became of one Alert on this screen. Keyed by kind: a Request may hold
// an extraction failure and a delivery Alert at once, cleared separately.
type Clearing =
  | { kind: 'idle' }
  | { kind: 'saving'; outcome: AlertOutcome }
  // A Re-run pressed from this card, not yet answered.
  | { kind: 'starting' }
  | { kind: 'cleared'; zone: 'in_flight' | null }
  // A Re-run started after this screen was read (ADR 0014): not gone, waiting.
  | { kind: 'deferred' }
  | { kind: 'problem'; message: string };

// An open Alert (spec §10.6, handoff screen 6): the silence in words, the
// number to ring, whose it is, and the kind's closed set as buttons. There is
// no text field anywhere on it, and there must never be one: the count of
// each outcome is the only measure the service has of how often this happens.
@Component({
  selector: 'app-reviewer-alert',
  template: `
    <article class="pane-body">
      @switch (view().kind) {
        @case ('gone') {
          <h2 #heading tabindex="-1" class="notice">{{ copy.gone }}</h2>
        }
        @case ('failed') {
          <h2 #heading tabindex="-1" class="notice" role="alert">
            {{ copy.loadFailed }}
          </h2>
        }
        @case ('ok') {
          @if (detail(); as d) {
            <h2 #heading tabindex="-1" class="figure">
              {{ d.alerts[0].reference }}
            </h2>
            @if (d.contact; as c) {
              <dl class="contact">
                <dt>{{ copy.requester }}</dt>
                <dd>{{ c.name }} {{ c.surname }}</dd>
                <dt>{{ copy.telephone }}</dt>
                <dd class="figure">{{ c.tel }}</dd>
                <dt>{{ copy.email }}</dt>
                <dd>{{ c.email }}</dd>
                <dt>{{ copy.workplace }}</dt>
                <dd>{{ c.workplace }}</dd>
              </dl>
              <p class="muted">{{ copy.contactVisible }}</p>
            }

            @for (alert of d.alerts; track alert.kind) {
              <section class="alert-card" [attr.aria-label]="title(alert)">
                <h3>{{ title(alert) }}</h3>
                <p>{{ describe(alert) }}</p>
                <p>{{ instruct(alert) }}</p>
                <p class="muted">
                  {{ assignedTo(alert) }} · {{ raisedAgo(alert) }}
                </p>
                @if (alert.kind !== 'extraction_failure') {
                  @if (!alert.assignedTo.active) {
                    <p>{{ assignedInactive(alert) }}</p>
                  } @else if (!alert.clearable) {
                    <p>{{ assignedOnly(alert) }}</p>
                  }
                }

                @switch (clearingOf(alert).kind) {
                  @case ('cleared') {
                    <p class="cleared" role="status">
                      {{ clearedText(alert) }}
                    </p>
                  }
                  @case ('deferred') {
                    <p class="rerunning" role="status">
                      {{ rerunning(alert, 1) }}
                    </p>
                  }
                  @default {
                    @if (alert.deferred) {
                      <p class="rerunning">{{ rerunning(alert, 0) }}</p>
                    } @else if (alert.clearable) {
                      <div class="outcomes">
                        @for (outcome of alert.outcomes; track outcome) {
                          <!-- Button's loading form (handoff.md "Loading
                               states"): the pressed one says it is saving and
                               keeps its size; a second press is ignored. -->
                          <button
                            class="btn btn-secondary"
                            type="button"
                            [disabled]="busy(alert)"
                            [attr.aria-busy]="
                              savingWith(alert, outcome) || null
                            "
                            (click)="clear(alert, outcome)"
                          >
                            {{
                              savingWith(alert, outcome)
                                ? copy.saving
                                : label(outcome)
                            }}
                          </button>
                        }
                      </div>
                      @if (alert.kind === 'extraction_failure') {
                        <!-- §10.9: Re-run lives here while the Alert holds
                             the Request; it defers the Alert, never clears
                             it (ADR 0014). -->
                        <div class="rerun-action">
                          <button
                            class="btn btn-secondary rerun"
                            type="button"
                            aria-describedby="alert-rerun-note"
                            [disabled]="busy(alert)"
                            [attr.aria-busy]="starting(alert) || null"
                            (click)="rerun(alert)"
                          >
                            {{
                              starting(alert) ? copy.rerunLoading : copy.rerun
                            }}
                          </button>
                          <p id="alert-rerun-note" class="muted small">
                            {{ copy.rerunNote }}
                          </p>
                        </div>
                      }
                      @if (problemOf(alert); as problem) {
                        <p class="problem" role="alert">{{ problem }}</p>
                      }
                    }
                    <p class="muted small">{{ copy.closedSetNote }}</p>
                  }
                }
              </section>
            }
          }
        }
      }
    </article>
  `,
  styles: `
    .pane-body {
      padding: 32px 40px;
      max-width: 880px;
    }
    h2 {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--primary);
    }
    h2:focus {
      outline: none;
    }
    h2:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 4px;
    }
    .notice {
      color: var(--foreground);
      font-size: 1.125rem;
    }
    .contact {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 4px 24px;
      margin: 24px 0 8px;
    }
    dt {
      color: var(--muted-foreground);
      font-size: 0.875rem;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .muted {
      color: var(--muted-foreground);
    }
    .small {
      font-size: 0.875rem;
    }
    /* handoff.md screen 6: pending-wash with a 2px pending left rule. */
    .alert-card {
      margin-top: 24px;
      padding: 20px 24px;
      background: var(--pending-wash);
      border-left: 2px solid var(--pending);
    }
    .alert-card h3 {
      font-size: 1.125rem;
      font-weight: 600;
    }
    .alert-card p {
      margin-top: 8px;
      max-width: 720px;
    }
    .outcomes {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 16px;
    }
    .rerun-action {
      margin-top: 16px;
    }
    .problem {
      color: var(--failed);
      font-weight: 600;
    }
    .cleared,
    .rerunning {
      font-weight: 600;
    }
  `,
})
export class AlertPage {
  private readonly api = inject(QueueApi);
  private readonly store = inject(QueueStore);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  protected readonly view = signal<View>({ kind: 'loading' });
  private readonly clearing = signal<Record<string, Clearing>>({});
  private asked = 0;

  protected readonly copy = {
    gone: m.reviewer_alert_gone(),
    loadFailed: m.reviewer_alert_load_failed(),
    requester: m.reviewer_dossier_requester_heading(),
    telephone: m.reviewer_dossier_telephone(),
    email: m.reviewer_dossier_email(),
    workplace: m.requester_workplace(),
    contactVisible: m.reviewer_contact_visible_note(),
    closedSetNote: m.reviewer_alert_closed_set_note(),
    saving: m.reviewer_alert_clearing(),
    rerun: m.reviewer_rerun(),
    rerunLoading: m.reviewer_rerun_loading(),
    rerunNote: m.reviewer_rerun_note(),
  };

  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((params) => void this.load(params.get('id') ?? ''));
  }

  protected detail(): AlertDetail | null {
    const view = this.view();
    return view.kind === 'ok' ? view.detail : null;
  }

  private async load(id: string): Promise<void> {
    this.view.set({ kind: 'loading' });
    this.clearing.set({});
    const asked = ++this.asked;
    const outcome = await this.api.alertDetail(id);
    if (asked !== this.asked) return;
    this.view.set(
      outcome.kind === 'ok'
        ? { kind: 'ok', detail: outcome.detail }
        : { kind: outcome.kind },
    );
    afterNextRender(() => this.heading()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  protected clearingOf(alert: AlertRow): Clearing {
    return this.clearing()[alert.kind] ?? { kind: 'idle' };
  }

  protected savingWith(alert: AlertRow, outcome: AlertOutcome): boolean {
    const clearing = this.clearingOf(alert);
    return clearing.kind === 'saving' && clearing.outcome === outcome;
  }

  protected busy(alert: AlertRow): boolean {
    const kind = this.clearingOf(alert).kind;
    return kind === 'saving' || kind === 'starting';
  }

  protected starting(alert: AlertRow): boolean {
    return this.clearingOf(alert).kind === 'starting';
  }

  /**
   * Re-run from the card: the Alert is then deferred, waiting on the new job,
   * so the card says so rather than offering outcomes (ADR 0014).
   */
  protected async rerun(alert: AlertRow): Promise<void> {
    if (this.busy(alert)) return;
    this.setClearing(alert, { kind: 'starting' });
    const outcome = await this.api.rerun(alert.requestId);
    switch (outcome.kind) {
      // `not_possible`: already extracting — someone else pressed it first.
      case 'done':
      case 'not_possible':
        this.setClearing(alert, { kind: 'deferred' });
        return;
      case 'gone':
        this.store.removeAlert(alert.requestId, alert.kind);
        this.setClearing(alert, {
          kind: 'problem',
          message: m.reviewer_alert_gone(),
        });
        return;
      default:
        this.setClearing(alert, {
          kind: 'problem',
          message: m.reviewer_rerun_failed(),
        });
    }
  }

  protected problemOf(alert: AlertRow): string | null {
    const clearing = this.clearingOf(alert);
    return clearing.kind === 'problem' ? clearing.message : null;
  }

  protected async clear(alert: AlertRow, outcome: AlertOutcome): Promise<void> {
    if (this.busy(alert)) return;
    this.setClearing(alert, { kind: 'saving', outcome });
    const result = await this.api.clearAlert(
      alert.requestId,
      alert.kind,
      outcome,
    );
    switch (result.kind) {
      case 'cleared':
        this.store.removeAlert(alert.requestId, alert.kind);
        this.setClearing(alert, { kind: 'cleared', zone: result.zone });
        return;
      case 'gone':
        this.store.removeAlert(alert.requestId, alert.kind);
        this.setClearing(alert, {
          kind: 'problem',
          message: m.reviewer_alert_gone(),
        });
        return;
      case 'deferred':
        this.setClearing(alert, { kind: 'deferred' });
        return;
      case 'refused':
        this.setClearing(alert, {
          kind: 'problem',
          message: m.reviewer_alert_clear_refused(),
        });
        return;
      case 'failed':
        this.setClearing(alert, {
          kind: 'problem',
          message: m.reviewer_alert_clear_failed(),
        });
    }
  }

  private setClearing(alert: AlertRow, clearing: Clearing): void {
    this.clearing.update((all) => ({ ...all, [alert.kind]: clearing }));
  }

  protected title = (alert: AlertRow) => alertTitle(alert.kind);
  protected label = outcomeLabel;

  protected describe(alert: AlertRow): string {
    switch (alert.kind) {
      case 'collection_lapse':
        return m.reviewer_alert_lapse_detail({
          hours: String(alert.silentHours),
        });
      case 'send_abandoned':
        return m.reviewer_alert_send_abandoned_detail();
      case 'extraction_failure':
        return m.reviewer_alert_extraction_detail();
    }
  }

  protected instruct(alert: AlertRow): string {
    return alert.kind === 'extraction_failure'
      ? m.reviewer_alert_extraction_instruction()
      : m.reviewer_alert_lapse_instruction();
  }

  protected assignedTo = alertAssignedTo;
  protected assignedOnly = (alert: AlertRow) =>
    m.reviewer_alert_assigned_only({ reviewer: alert.assignedTo.displayName });
  protected assignedInactive = (alert: AlertRow) =>
    m.reviewer_alert_assigned_inactive({
      reviewer: alert.assignedTo.displayName,
    });
  /** `started` counts a Re-run begun since this screen was read. */
  protected rerunning = (alert: AlertRow, started: number) =>
    m.reviewer_alert_rerunning({ attempts: alert.rerunAttempts + started });
  protected raisedAgo = (alert: AlertRow) => alertRaisedAgo(alert, Date.now());

  protected clearedText(alert: AlertRow): string {
    const clearing = this.clearingOf(alert);
    return clearing.kind === 'cleared' && clearing.zone === 'in_flight'
      ? m.reviewer_alert_cleared_in_flight()
      : m.reviewer_alert_cleared_ended();
  }
}
