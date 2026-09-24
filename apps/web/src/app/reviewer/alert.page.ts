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
import { alertTitle, outcomeLabel } from './alert-copy';
import {
  type AlertDetail,
  type AlertDetailOutcome,
  type AlertOutcome,
  type AlertRow,
  QueueApi,
} from './queue-api';
import { formatDuration, minutesSince } from './queue-format';
import { QueueStore } from './queue-store';

type View =
  | { kind: 'loading' }
  | { kind: 'ok'; detail: AlertDetail }
  | Exclude<AlertDetailOutcome, { kind: 'ok' }>;

// What became of one Alert on this screen. Keyed by kind: a Request may hold
// an extraction failure and a delivery Alert at once, cleared separately.
type Clearing =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'cleared'; zone: 'in_flight' | null }
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
            <dl class="contact">
              <dt>{{ copy.requester }}</dt>
              <dd>{{ d.contact.name }} {{ d.contact.surname }}</dd>
              <dt>{{ copy.telephone }}</dt>
              <dd class="figure">{{ d.contact.tel }}</dd>
              <dt>{{ copy.email }}</dt>
              <dd>{{ d.contact.email }}</dd>
              <dt>{{ copy.workplace }}</dt>
              <dd>{{ d.contact.workplace }}</dd>
            </dl>
            <p class="muted">{{ copy.contactVisible }}</p>

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
                  @default {
                    @if (alert.deferred) {
                      <p class="rerunning">{{ rerunning(alert) }}</p>
                    } @else if (alert.clearable) {
                      <div class="outcomes">
                        @for (outcome of alert.outcomes; track outcome) {
                          <button
                            class="btn btn-secondary"
                            type="button"
                            [disabled]="clearingOf(alert).kind === 'saving'"
                            (click)="clear(alert, outcome)"
                          >
                            {{ label(outcome) }}
                          </button>
                        }
                      </div>
                      @if (clearingOf(alert).kind === 'saving') {
                        <p class="muted" role="status">{{ copy.saving }}</p>
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

  protected problemOf(alert: AlertRow): string | null {
    const clearing = this.clearingOf(alert);
    return clearing.kind === 'problem' ? clearing.message : null;
  }

  protected async clear(alert: AlertRow, outcome: AlertOutcome): Promise<void> {
    if (this.clearingOf(alert).kind === 'saving') return;
    this.set(alert, { kind: 'saving' });
    const result = await this.api.clearAlert(
      alert.requestId,
      alert.kind,
      outcome,
    );
    switch (result.kind) {
      case 'cleared':
        this.store.removeAlert(alert.requestId, alert.kind);
        this.set(alert, { kind: 'cleared', zone: result.zone });
        return;
      case 'gone':
        this.store.removeAlert(alert.requestId, alert.kind);
        this.set(alert, { kind: 'problem', message: m.reviewer_alert_gone() });
        return;
      case 'refused':
        this.set(alert, {
          kind: 'problem',
          message: m.reviewer_alert_clear_refused(),
        });
        return;
      case 'failed':
        this.set(alert, {
          kind: 'problem',
          message: m.reviewer_alert_clear_failed(),
        });
    }
  }

  private set(alert: AlertRow, clearing: Clearing): void {
    this.clearing.update((all) => ({ ...all, [alert.kind]: clearing }));
  }

  protected title = (alert: AlertRow) => alertTitle(alert.kind);
  protected label = outcomeLabel;

  protected describe(alert: AlertRow): string {
    switch (alert.kind) {
      case 'collection_lapse':
        return m.reviewer_alert_lapse_detail({
          hours: alert.silentHours ?? 24,
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

  protected assignedTo = (alert: AlertRow) =>
    m.reviewer_alert_assigned_to({ reviewer: alert.assignedTo.displayName });
  protected assignedOnly = (alert: AlertRow) =>
    m.reviewer_alert_assigned_only({ reviewer: alert.assignedTo.displayName });
  protected assignedInactive = (alert: AlertRow) =>
    m.reviewer_alert_assigned_inactive({
      reviewer: alert.assignedTo.displayName,
    });
  protected rerunning = (alert: AlertRow) =>
    m.reviewer_alert_rerunning({ attempts: alert.rerunAttempts });
  protected raisedAgo = (alert: AlertRow) =>
    m.reviewer_alert_raised_ago({
      time: formatDuration(
        minutesSince(new Date(alert.raisedAt).getTime(), Date.now()),
      ),
    });

  protected clearedText(alert: AlertRow): string {
    const clearing = this.clearingOf(alert);
    return clearing.kind === 'cleared' && clearing.zone === 'in_flight'
      ? m.reviewer_alert_cleared_in_flight()
      : m.reviewer_alert_cleared_ended();
  }
}
