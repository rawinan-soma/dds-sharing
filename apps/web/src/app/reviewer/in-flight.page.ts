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
import { formatDay } from '../requester/format-day';
import { areaHeadline, areaProvinces } from './area-copy';
import { linkLeft } from './in-flight-copy';
import {
  type ActionOutcome,
  type InFlightDetail,
  type InFlightDetailOutcome,
  QueueApi,
} from './queue-api';
import { formatInstant } from './queue-format';
import { QueueStore } from './queue-store';

type View =
  | { kind: 'loading' }
  | { kind: 'ok'; detail: InFlightDetail }
  | Exclude<InFlightDetailOutcome, { kind: 'ok' }>;

type Action = 'resend' | 'rerun';

// What became of the last press on this screen.
type Acting =
  | { kind: 'idle' }
  | { kind: 'busy'; action: Action }
  | { kind: 'said'; message: string; problem: boolean };

// One in-flight Request (spec §10.9, handoff screen 6): who, what, the
// decision line, the file, and the two things a Reviewer can do to it. The
// actions are gated by what is physically possible; a held one stays
// focusable and says why (`aria-disabled`, never `disabled`), because a
// greyed button with no reason reads as a broken screen.
//
// ⚠️ There is no third action and there must not be one: a Reviewer never
// corrects a Requester's email address (ADR 0017). Neither button sends a
// body, and nothing here takes an address. The absence is stated on screen.
@Component({
  selector: 'app-reviewer-in-flight',
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
            <h2 #heading tabindex="-1" class="figure">{{ d.reference }}</h2>
            <p class="muted">
              {{ approvedBy(d) }} ·
              <time [attr.datetime]="d.approvedAt">{{
                instant(d.approvedAt)
              }}</time>
            </p>

            <div class="ledger">
              <section>
                <h3>{{ copy.whoHeading }}</h3>
                <dl>
                  <dt>{{ copy.requester }}</dt>
                  <dd>{{ d.contact.name }} {{ d.contact.surname }}</dd>
                  <dt>{{ copy.telephone }}</dt>
                  <dd class="figure">{{ d.contact.tel }}</dd>
                  <dt>{{ copy.email }}</dt>
                  <dd>{{ d.contact.email }}</dd>
                  <dt>{{ copy.workplace }}</dt>
                  <dd>{{ d.contact.workplace }}</dd>
                </dl>
                <p class="muted small">{{ copy.contactVisible }}</p>
              </section>
              <section>
                <h3>{{ copy.askHeading }}</h3>
                <dl>
                  <dt>{{ copy.group }}</dt>
                  <dd>{{ d.diseaseGroupName }}</dd>
                  <dt>{{ copy.dates }}</dt>
                  <dd>
                    <time [attr.datetime]="d.startDate">{{
                      day(d.startDate)
                    }}</time>
                    –
                    <time [attr.datetime]="d.endDate">{{
                      day(d.endDate)
                    }}</time>
                  </dd>
                  <dt>{{ copy.area }}</dt>
                  <dd>
                    {{ areaHeadline(d.area) }}
                    @if (areaProvinces(d.area); as names) {
                      <span class="muted">{{ names }}</span>
                    }
                  </dd>
                </dl>
              </section>
            </div>

            <section class="file">
              <h3>{{ copy.fileHeading }}</h3>
              <p class="state">{{ stateWord(d) }}</p>
              @if (d.file; as f) {
                <dl>
                  <dt>{{ copy.archive }}</dt>
                  <dd class="figure">{{ f.archiveFilename }}</dd>
                  <dt>{{ copy.expiresIn }}</dt>
                  <dd class="figure">
                    <time [attr.datetime]="f.linkExpiresAt">{{
                      left(f.linkExpiresAt)
                    }}</time>
                  </dd>
                  <dt>{{ copy.attempts }}</dt>
                  <dd class="figure">{{ attempts(f.attempts) }}</dd>
                </dl>
              } @else {
                <p class="muted">{{ copy.noFile }}</p>
              }
            </section>

            <section class="actions">
              <h3>{{ copy.actionsHeading }}</h3>
              <div class="action">
                <button
                  class="btn btn-secondary resend"
                  type="button"
                  [attr.aria-disabled]="!may(d, 'resend') || null"
                  [attr.aria-describedby]="
                    may(d, 'resend') ? 'resend-note' : 'resend-held'
                  "
                  [attr.aria-busy]="busyWith('resend') || null"
                  (click)="act(d, 'resend')"
                >
                  {{ busyWith('resend') ? copy.resendLoading : copy.resend }}
                </button>
                <p id="resend-note" class="muted small">
                  {{ copy.resendNote }}
                </p>
                @if (!may(d, 'resend')) {
                  <p id="resend-held" class="small">{{ heldReason(d) }}</p>
                }
              </div>
              <div class="action">
                <button
                  class="btn btn-secondary rerun"
                  type="button"
                  [attr.aria-disabled]="!may(d, 'rerun') || null"
                  [attr.aria-describedby]="
                    may(d, 'rerun') ? 'rerun-note' : 'rerun-held'
                  "
                  [attr.aria-busy]="busyWith('rerun') || null"
                  (click)="act(d, 'rerun')"
                >
                  {{ busyWith('rerun') ? copy.rerunLoading : copy.rerun }}
                </button>
                <p id="rerun-note" class="muted small">{{ copy.rerunNote }}</p>
                @if (!may(d, 'rerun')) {
                  <p id="rerun-held" class="small">
                    {{ copy.extractingNote }}
                  </p>
                }
              </div>
              @if (said(); as s) {
                <p
                  class="said"
                  [class.problem]="s.problem"
                  [attr.role]="s.problem ? 'alert' : 'status'"
                >
                  {{ s.message }}
                </p>
              }
            </section>

            <!-- ADR 0017: the absence most likely to be "fixed", so it is
                 stated rather than left invisible. -->
            <section class="no-email-edit">
              <h3>{{ copy.noEmailEditHeading }}</h3>
              <p>{{ copy.noEmailEditDetail }}</p>
            </section>
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
    h3 {
      font-size: 1.125rem;
      font-weight: 600;
    }
    .notice {
      color: var(--foreground);
      font-size: 1.125rem;
    }
    .ledger {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 48px;
      margin-top: 24px;
    }
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 4px 24px;
      margin: 12px 0 8px;
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
    .file,
    .actions {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
    }
    .state {
      margin-top: 8px;
      font-weight: 600;
    }
    .action {
      margin-top: 16px;
    }
    .action p {
      margin-top: 4px;
      max-width: 720px;
    }
    .said {
      margin-top: 16px;
      font-weight: 600;
    }
    .said.problem {
      color: var(--failed);
    }
    /* handoff.md screen 6: the stated absence, in failed-wash. */
    .no-email-edit {
      margin-top: 24px;
      padding: 20px 24px;
      background: var(--failed-wash);
    }
    .no-email-edit p {
      margin-top: 8px;
      max-width: 720px;
    }
  `,
})
export class InFlightPage {
  private readonly api = inject(QueueApi);
  private readonly store = inject(QueueStore);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  protected readonly view = signal<View>({ kind: 'loading' });
  private readonly acting = signal<Acting>({ kind: 'idle' });
  private asked = 0;

  protected readonly copy = {
    gone: m.reviewer_inflight_gone(),
    loadFailed: m.reviewer_inflight_load_failed(),
    whoHeading: m.reviewer_dossier_requester_heading(),
    askHeading: m.reviewer_dossier_ask_heading(),
    requester: m.reviewer_dossier_requester_heading(),
    telephone: m.reviewer_dossier_telephone(),
    email: m.reviewer_dossier_email(),
    workplace: m.requester_workplace(),
    contactVisible: m.reviewer_contact_visible_note(),
    group: m.reviewer_dossier_group(),
    dates: m.reviewer_dossier_dates(),
    area: m.reviewer_dossier_area(),
    fileHeading: m.reviewer_file_heading(),
    archive: m.reviewer_file_name(),
    expiresIn: m.reviewer_file_expires_in(),
    attempts: m.reviewer_file_attempts(),
    noFile: m.reviewer_file_none(),
    actionsHeading: m.reviewer_actions_heading(),
    resend: m.reviewer_resend(),
    resendLoading: m.reviewer_resend_loading(),
    resendNote: m.reviewer_resend_note(),
    rerun: m.reviewer_rerun(),
    rerunLoading: m.reviewer_rerun_loading(),
    rerunNote: m.reviewer_rerun_note(),
    extractingNote: m.reviewer_inflight_extracting_note(),
    noEmailEditHeading: m.reviewer_no_email_edit_heading(),
    noEmailEditDetail: m.reviewer_no_email_edit_detail(),
  };

  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((params) => void this.load(params.get('id') ?? ''));
  }

  protected detail(): InFlightDetail | null {
    const view = this.view();
    return view.kind === 'ok' ? view.detail : null;
  }

  private async load(id: string): Promise<void> {
    this.view.set({ kind: 'loading' });
    this.acting.set({ kind: 'idle' });
    const asked = ++this.asked;
    const outcome = await this.api.inFlightDetail(id);
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

  protected may(d: InFlightDetail, action: Action): boolean {
    return d.actions[action];
  }

  protected busyWith(action: Action): boolean {
    const acting = this.acting();
    return acting.kind === 'busy' && acting.action === action;
  }

  protected said(): { message: string; problem: boolean } | null {
    const acting = this.acting();
    return acting.kind === 'said' ? acting : null;
  }

  protected async act(d: InFlightDetail, action: Action): Promise<void> {
    if (!this.may(d, action) || this.acting().kind === 'busy') return;
    this.acting.set({ kind: 'busy', action });
    const outcome =
      action === 'rerun'
        ? await this.api.rerun(d.requestId)
        : await this.api.resend(d.requestId);
    if (outcome.kind === 'done' && action === 'rerun') this.startedReRun(d);
    this.acting.set({
      kind: 'said',
      message: this.message(action, outcome),
      problem: outcome.kind !== 'done',
    });
  }

  /**
   * A Re-run is extracting now: both actions are held until it finishes,
   * here and on the row, without a re-read — the list does not refresh.
   */
  private startedReRun(d: InFlightDetail): void {
    const held = {
      extraction: 'extracting' as const,
      actions: { rerun: false, resend: false },
    };
    this.view.set({ kind: 'ok', detail: { ...d, ...held } });
    this.store.updateInFlight(d.requestId, held);
  }

  private message(action: Action, outcome: ActionOutcome): string {
    switch (outcome.kind) {
      case 'done':
        return action === 'rerun'
          ? m.reviewer_rerun_started()
          : m.reviewer_resend_sent();
      case 'gone':
        return m.reviewer_inflight_gone();
      case 'not_possible':
        return m.reviewer_inflight_extracting_note();
      case 'unavailable':
        return m.reviewer_resend_unavailable();
      case 'failed':
        return action === 'rerun'
          ? m.reviewer_rerun_failed()
          : m.reviewer_resend_failed();
    }
  }

  protected stateWord(d: InFlightDetail): string {
    switch (d.extraction) {
      case 'extracting':
        return m.reviewer_state_extracting();
      case 'failed':
        return m.reviewer_state_failed();
      case 'ready':
        return m.reviewer_state_ready();
    }
  }

  protected heldReason(d: InFlightDetail): string {
    return d.extraction === 'failed'
      ? m.reviewer_inflight_failed_note()
      : m.reviewer_inflight_extracting_note();
  }

  protected approvedBy = (d: InFlightDetail) =>
    m.reviewer_approved_by({ reviewer: d.approvedBy });
  protected attempts = (count: number) =>
    m.reviewer_file_attempts_value({ count });
  protected left = (expiresAt: string) => linkLeft(expiresAt, Date.now());
  protected day = formatDay;
  protected instant = formatInstant;
  protected areaHeadline = areaHeadline;
  protected areaProvinces = areaProvinces;
}
