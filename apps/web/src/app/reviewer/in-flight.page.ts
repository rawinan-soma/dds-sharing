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
import { areaLine } from './area-copy';
import { Icon } from './icon';
import { extractionTone, extractionWord, linkLeft } from './in-flight-copy';
import {
  type ActionOutcome,
  type InFlightDetail,
  type InFlightDetailOutcome,
  QueueApi,
} from './queue-api';
import { formatShortInstant } from './queue-format';
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

// One in-flight Request (spec §10.9, system.md frame 6b): who, what, the
// decision and the link in the header, and the two things a Reviewer can do
// to it side by side. The actions are gated by what is physically possible; a
// held one stays focusable and says why (`aria-disabled`, never `disabled`),
// because a greyed button with no reason reads as a broken screen.
//
// ⚠️ There is no third action and there must not be one: a Reviewer never
// corrects a Requester's email address (ADR 0017). Neither button sends a
// body, and nothing here takes an address. The absence is stated on screen,
// on inert-wash with a lock: it is a rule, not a fault, and it is on every
// in-flight dossier, so red there would teach Reviewers to ignore red.
@Component({
  selector: 'app-reviewer-in-flight',
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
                <div class="head-tags">
                  <span [class]="'tag md ' + tone(d)">{{ stateWord(d) }}</span>
                </div>
                <p class="reference figure">{{ d.reference }}</p>
                <h2 #heading tabindex="-1">
                  {{ d.contact.name }} {{ d.contact.surname }}
                </h2>
              </div>
              <dl class="head-cells">
                <div>
                  <dt>{{ copy.approvedBy }}</dt>
                  <dd>{{ d.approvedBy }}</dd>
                </div>
                <div>
                  <dt>{{ copy.approvedAt }}</dt>
                  <dd>
                    <time [attr.datetime]="d.approvedAt">{{
                      shortInstant(d.approvedAt)
                    }}</time>
                  </dd>
                </div>
                <div>
                  <dt>{{ copy.linkLeft }}</dt>
                  @if (d.file && d.linkExpiresAt) {
                    <dd class="success">
                      <time [attr.datetime]="d.linkExpiresAt">{{
                        left(d.linkExpiresAt)
                      }}</time>
                    </dd>
                  } @else {
                    <dd>{{ copy.noFile }}</dd>
                  }
                </div>
                <div>
                  <dt>{{ copy.attempts }}</dt>
                  <dd>{{ d.file ? attempts(d.file.attempts) : '—' }}</dd>
                </div>
              </dl>
            </header>

            <div class="dossier-columns">
              <section aria-labelledby="who">
                <h3 id="who" class="section-title">{{ copy.whoHeading }}</h3>
                <dl class="rows compact">
                  <div>
                    <dt>{{ copy.firstName }}</dt>
                    <dd>{{ d.contact.name }}</dd>
                  </div>
                  <div>
                    <dt>{{ copy.lastName }}</dt>
                    <dd>{{ d.contact.surname }}</dd>
                  </div>
                  <div>
                    <dt>{{ copy.workplace }}</dt>
                    <dd>{{ d.contact.workplace }}</dd>
                  </div>
                  <div>
                    <dt>{{ copy.telephone }}</dt>
                    <dd class="figure">{{ d.contact.tel }}</dd>
                  </div>
                  <div>
                    <dt>{{ copy.email }}</dt>
                    <dd class="email">{{ d.contact.email }}</dd>
                  </div>
                </dl>
                <p class="contact-note">{{ copy.contactVisible }}</p>
              </section>
              <section aria-labelledby="ask">
                <h3 id="ask" class="section-title">{{ copy.askHeading }}</h3>
                <dl class="rows compact">
                  <div>
                    <dt>{{ copy.group }}</dt>
                    <dd>{{ d.diseaseGroupName }}</dd>
                  </div>
                  <div>
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
                  </div>
                  <div>
                    <dt>{{ copy.area }}</dt>
                    <dd>{{ areaLine(d.area) }}</dd>
                  </div>
                </dl>
              </section>
            </div>

            <section class="actions" [attr.aria-label]="copy.actionsHeading">
              <div class="action">
                <h3>{{ copy.resendTitle }}</h3>
                <p id="resend-note">{{ copy.resendNote }}</p>
                @if (!may(d, 'resend')) {
                  <p id="resend-held" class="held">{{ heldReason(d) }}</p>
                }
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
              </div>
              <div class="action">
                <h3>{{ copy.rerunTitle }}</h3>
                <p id="rerun-note">{{ copy.rerunNote }}</p>
                @if (!may(d, 'rerun')) {
                  <p id="rerun-held" class="held">
                    {{ copy.extractingNote }}
                  </p>
                }
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
                  <app-icon name="refresh" />
                  {{ busyWith('rerun') ? copy.rerunLoading : copy.rerun }}
                </button>
              </div>
            </section>
            @if (said(); as s) {
              <p
                class="said"
                [class.problem]="s.problem"
                [attr.role]="s.problem ? 'alert' : 'status'"
              >
                {{ s.message }}
              </p>
            }

            <!-- ADR 0017: the absence most likely to be "fixed", so it is
                 stated rather than left invisible. -->
            <section class="absence">
              <app-icon name="lock" />
              <div>
                <h3 class="absence-title">{{ copy.noEmailEditHeading }}</h3>
                <p>{{ copy.noEmailEditDetail }}</p>
              </div>
            </section>
          </article>
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .email {
      overflow-wrap: anywhere;
    }
    .contact-note {
      margin-top: 8px;
      font-size: 13px;
      color: var(--muted-foreground);
    }
    .actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 40px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
    }
    .action {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }
    .action h3 {
      font-size: 14px;
      font-weight: 600;
    }
    .action p {
      font-size: 14px;
      color: var(--muted-foreground);
    }
    .action p.held {
      color: var(--foreground);
    }
    .action .btn {
      margin-top: 6px;
    }
    .said {
      font-weight: 600;
    }
    .said.problem {
      color: var(--failed);
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
    firstName: m.requester_first_name(),
    lastName: m.requester_last_name(),
    telephone: m.reviewer_dossier_telephone(),
    email: m.reviewer_dossier_email(),
    workplace: m.requester_workplace(),
    contactVisible: m.reviewer_contact_visible_note(),
    group: m.reviewer_dossier_group(),
    dates: m.reviewer_dossier_dates(),
    area: m.reviewer_dossier_area(),
    approvedBy: m.reviewer_approved_by_label(),
    approvedAt: m.reviewer_approved_at_label(),
    linkLeft: m.reviewer_link_left_label(),
    attempts: m.reviewer_file_attempts(),
    noFile: m.reviewer_file_none(),
    actionsHeading: m.reviewer_actions_heading(),
    resendTitle: m.reviewer_resend_title(),
    resend: m.reviewer_resend(),
    resendLoading: m.reviewer_resend_loading(),
    resendNote: m.reviewer_resend_note(),
    rerunTitle: m.reviewer_rerun_title(),
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
    if (outcome.kind === 'done' && action === 'rerun') this.startedRerun(d);
    if (outcome.kind === 'gone') this.store.removeInFlight(d.requestId);
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
  private startedRerun(d: InFlightDetail): void {
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
        return action === 'rerun'
          ? m.reviewer_inflight_extracting_note()
          : m.reviewer_resend_not_possible();
      case 'unavailable':
        return m.reviewer_resend_unavailable();
      case 'failed':
        return action === 'rerun'
          ? m.reviewer_rerun_failed()
          : m.reviewer_resend_failed();
    }
  }

  protected stateWord = (d: InFlightDetail) => extractionWord(d.extraction);
  protected tone = (d: InFlightDetail) => extractionTone(d.extraction);

  protected heldReason(d: InFlightDetail): string {
    return d.extraction === 'failed'
      ? m.reviewer_inflight_failed_note()
      : m.reviewer_inflight_extracting_note();
  }

  protected attempts = (count: number) =>
    m.reviewer_file_attempts_value({ count });
  protected left = (expiresAt: string) => linkLeft(expiresAt, Date.now());
  protected day = formatDay;
  protected shortInstant = formatShortInstant;
  protected areaLine = areaLine;
}
