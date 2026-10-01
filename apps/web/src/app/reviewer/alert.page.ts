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
import { formatShortInstant } from './queue-format';
import { QueueStore } from './queue-store';
import { Icon } from './icon';

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

// An open Alert (spec §10.6, system.md frame 6a): the silence in words, then
// the Requester's contact block INSIDE the card, above the outcome buttons:
// the outcome is a call, so the number is read before the outcomes, not after
// them. Whose it is, and the kind's closed set as buttons. There is no text
// field anywhere on it, and there must never be one: the count of each
// outcome is the only measure the service has of how often this happens.
// The two undrawn kinds (collection lapse, send abandoned) follow the same card.
@Component({
  selector: 'app-reviewer-alert',
  imports: [Icon],
  template: `
    @switch (view().kind) {
      @case ('gone') {
        <div class="dossier-message">
          <h2 #heading tabindex="-1">{{ copy.gone }}</h2>
        </div>
      }
      @case ('failed') {
        <div class="dossier-message">
          <h2 #heading tabindex="-1" role="alert">{{ copy.loadFailed }}</h2>
        </div>
      }
      @case ('ok') {
        @if (detail(); as d) {
          <article class="dossier">
            <header class="dossier-head">
              <div>
                <p class="reference figure">{{ d.alerts[0].reference }}</p>
                <h2 #heading tabindex="-1">{{ name(d) }}</h2>
              </div>
              <dl class="head-cells">
                <div>
                  <dt>{{ copy.approvedBy }}</dt>
                  <dd>{{ d.alerts[0].assignedTo.displayName }}</dd>
                </div>
                <div>
                  <dt>{{ copy.raised }}</dt>
                  <dd>
                    <time [attr.datetime]="d.alerts[0].raisedAt">{{
                      shortInstant(d.alerts[0].raisedAt)
                    }}</time>
                  </dd>
                </div>
              </dl>
            </header>

            @for (alert of d.alerts; track alert.kind) {
              <section class="alert-card" [attr.aria-label]="title(alert)">
                <h3 class="alert-title">{{ title(alert) }}</h3>
                <p>{{ describe(alert) }}</p>
                <p>{{ instruct(alert) }}</p>
                <p class="meta">
                  {{ assignedTo(alert) }} · {{ raisedAgo(alert) }}
                </p>
                @if (alert.kind !== 'extraction_failure') {
                  @if (!alert.assignedTo.active) {
                    <p>{{ assignedInactive(alert) }}</p>
                  } @else if (!alert.clearable) {
                    <p>{{ assignedOnly(alert) }}</p>
                  }
                }

                @if (d.contact; as c) {
                  <dl class="contact">
                    <div>
                      <dt>{{ copy.requester }}</dt>
                      <dd>
                        {{ c.name }} {{ c.surname }}
                        <span class="muted">· {{ c.workplace }}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>{{ copy.telephone }}</dt>
                      <dd class="tel figure">{{ c.tel }}</dd>
                    </div>
                    <div>
                      <dt>{{ copy.email }}</dt>
                      <dd class="email">{{ c.email }}</dd>
                    </div>
                  </dl>
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
                            [disabled]="
                              busy(alert) && !savingWith(alert, outcome)
                            "
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
                      @if (problemOf(alert); as problem) {
                        <p class="problem" role="alert">{{ problem }}</p>
                      }
                    }
                    <p class="meta">{{ copy.closedSetNote }}</p>
                  }
                }
              </section>

              <!-- §10.9: Re-run lives here while the Alert holds the Request;
                   it defers the Alert, never clears it (ADR 0014). -->
              @if (
                alert.kind === 'extraction_failure' &&
                alert.clearable &&
                !alert.deferred &&
                offersRerun(alert)
              ) {
                <div class="rerun-strip">
                  <p id="alert-rerun-note" class="rerun-note">
                    {{ copy.rerunNote }}
                  </p>
                  <button
                    class="btn btn-secondary btn-lg rerun"
                    type="button"
                    aria-describedby="alert-rerun-note"
                    [disabled]="busy(alert) && !starting(alert)"
                    [attr.aria-busy]="starting(alert) || null"
                    (click)="rerun(alert)"
                  >
                    <app-icon name="refresh" />
                    {{ starting(alert) ? copy.rerunLoading : copy.rerun }}
                  </button>
                </div>
              }
            }

            @if (d.contact) {
              <p class="contact-note">{{ copy.contactVisible }}</p>
            }
          </article>
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    /* The Statement's compact form: pending-wash, a 2px pending rule. */
    .alert-card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 880px;
      padding: 24px;
      background: var(--pending-wash);
      border-left: 2px solid var(--pending);
      border-radius: var(--radius-lg);
    }
    .alert-card > p {
      max-width: 720px;
    }
    .alert-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--pending);
    }
    .meta {
      font-size: 13px;
      color: var(--muted-foreground);
    }
    .contact {
      display: grid;
      gap: 6px;
      margin: 8px 0;
      padding: 16px 20px;
      background: var(--card);
      border-radius: var(--radius-panel);
    }
    .contact > div {
      display: grid;
      grid-template-columns: 96px minmax(0, 1fr);
      gap: 16px;
      align-items: baseline;
    }
    .contact dt {
      font-size: 13px;
      color: var(--muted-foreground);
    }
    .contact dd {
      margin: 0;
    }
    .tel {
      font-size: 18px;
      font-weight: 600;
    }
    .email {
      overflow-wrap: anywhere;
    }
    .outcomes {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .problem {
      color: var(--failed);
      font-weight: 600;
    }
    .cleared,
    .rerunning {
      font-weight: 600;
    }
    .rerun-strip {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px 24px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
    }
    .rerun-note {
      flex: 1 1 320px;
      max-width: 640px;
      font-size: 14px;
      color: var(--muted-foreground);
    }
    .contact-note {
      font-size: 13px;
      color: var(--muted-foreground);
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
    requester: m.reviewer_col_requester(),
    approvedBy: m.reviewer_approved_by_label(),
    raised: m.reviewer_col_raised(),
    telephone: m.reviewer_dossier_telephone(),
    email: m.reviewer_dossier_email(),
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
  protected shortInstant = formatShortInstant;
  protected name = (d: AlertDetail) =>
    d.contact
      ? `${d.contact.name} ${d.contact.surname}`
      : d.alerts[0].requesterName;

  /** Re-run is offered until a press on this card has settled it. */
  protected offersRerun(alert: AlertRow): boolean {
    const kind = this.clearingOf(alert).kind;
    return kind !== 'cleared' && kind !== 'deferred';
  }
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
