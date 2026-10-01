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
import { ActivatedRoute, RouterLink } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import {
  ContactRows,
  DateRange,
  DossierMessage,
  dateRangeText,
  focusHeadingAfterRender,
  fullName,
} from './dossier-parts';
import { areaLine } from './area-copy';
import { Dialog } from './dialog';
import { Field } from './field';
import { Icon } from './icon';
import {
  type DecisionOutcome,
  type Dossier,
  type DossierOutcome,
  QueueApi,
} from './queue-api';
import { formatDuration, formatInstant } from './queue-format';
import { QueueStore } from './queue-store';

// The outcomes QueueApi can report, plus the moment before any of them has
// arrived. Reusing DossierOutcome's union keeps the two from drifting apart.
type View =
  | { kind: 'loading' }
  | { kind: 'ok'; dossier: Dossier }
  | Exclude<DossierOutcome, { kind: 'ok' }>;

// Mirrors apps/api/src/reviewer/decisions.ts's MIN_NOTE_LENGTH (spec §10.3).
// This copy is UX only — disables the submit button before a round trip — the
// server enforces the rule regardless and is the one that can change it.
const MIN_NOTE_LENGTH = 10;

// The action area's own small state machine (§10.3): the strip beneath the
// ask, a dialog before an approval, a dialog taking the mandatory note before
// a rejection, and finally the plain statement of what was recorded in the
// strip's slot. Nothing here auto-advances to another Request (§10.3's
// warning) and nothing persists the note outside this component (§10.5).
type DecisionPhase =
  | { kind: 'idle' }
  | { kind: 'approve-confirm'; problem: DecisionProblem | null }
  | { kind: 'reject-note'; problem: DecisionProblem | null }
  | { kind: 'recorded'; decision: 'approved' | 'rejected'; decidedAt: string }
  | { kind: 'request-expired' };

type DecisionProblem = 'gone' | 'invalid_note' | 'failed';

const ROW_COUNT_FORMAT = new Intl.NumberFormat('th-TH');

// The review screen (system.md screen 5): the reference over the Requester's
// name with the clock beside it, then who is asking and what they asked for
// side by side, then the decision strip beneath BOTH columns. The strip sits
// after the ask in the DOM as well as on screen, so the tab order says what
// the layout says: Approve is not reachable without passing what is judged.
// It must not be floated, pinned or made sticky.
@Component({
  selector: 'app-reviewer-dossier',
  imports: [
    ContactRows,
    DateRange,
    Dialog,
    DossierMessage,
    Field,
    Icon,
    RouterLink,
  ],
  template: `
    @switch (view().kind) {
      @case ('ok') {
        @if (currentDossier(); as d) {
          <article class="dossier">
            <header class="dossier-head">
              <div>
                <p class="reference figure">{{ d.reference }}</p>
                <h2 tabindex="-1">{{ fullName(d.contact) }}</h2>
              </div>
              <dl class="head-cells">
                <div>
                  <dt>{{ copy.submitted }}</dt>
                  <dd>
                    <time [attr.datetime]="d.submittedAt">{{
                      instant(d.submittedAt)
                    }}</time>
                  </dd>
                </div>
                <div>
                  <dt>{{ copy.clock }}</dt>
                  <dd>
                    {{
                      expiredNow(d)
                        ? copy.clockExpired
                        : timeLeft(d.minutesLeft)
                    }}
                  </dd>
                </div>
                <div>
                  <dt>{{ copy.aheadLabel }}</dt>
                  <dd>{{ ahead(d.ahead) }}</dd>
                </div>
              </dl>
            </header>

            <div class="dossier-columns">
              <section aria-labelledby="who">
                <h3 id="who" class="section-title">{{ copy.whoHeading }}</h3>
                <app-contact-rows [contact]="d.contact" />
              </section>

              <section aria-labelledby="ask">
                <h3 id="ask" class="section-title">{{ copy.askHeading }}</h3>
                <dl class="rows compact">
                  <div>
                    <dt>{{ copy.group }}</dt>
                    <dd>
                      {{ d.diseaseGroupName }}
                      <details class="codes">
                        <summary>
                          <app-icon name="chevron" [size]="14" />
                          {{ codesDisclosure(d.reportCodes.length) }}
                        </summary>
                        <p class="figure">{{ d.reportCodes.join(', ') }}</p>
                      </details>
                    </dd>
                  </div>
                  <div>
                    <dt>{{ copy.dates }}</dt>
                    <dd>
                      <app-date-range [start]="d.startDate" [end]="d.endDate" />
                      <span class="note">{{ copy.datesInclusive }}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>{{ copy.area }}</dt>
                    <dd>{{ areaLine(d.area) }}</dd>
                  </div>
                  <!-- One slot and one size in every state: a missing count
                       reads as a fact, not a blocker. Nothing waits on it. -->
                  <div>
                    <dt>{{ copy.probe }}</dt>
                    <dd>
                      <span class="figure">{{ rowCount(d.rowCount) }}</span>
                      <span class="note">{{
                        d.rowCount === 'failed'
                          ? copy.probeFailedNote
                          : copy.probeNote
                      }}</span>
                    </dd>
                  </div>
                </dl>
              </section>
            </div>

            <div class="decision-slot">
              @if (d.expired) {
                <section class="statement pending" role="status">
                  <p class="statement-title">{{ copy.clockExpired }}</p>
                  <p>{{ copy.expired }}</p>
                </section>
              } @else {
                @switch (decisionPhase().kind) {
                  @case ('recorded') {
                    @if (asRecorded(); as rec) {
                      @if (rec.decision === 'approved') {
                        <section
                          #statement
                          tabindex="-1"
                          class="statement success"
                          role="status"
                        >
                          <p class="statement-title">
                            {{ approvedHeading(rec.decidedAt) }}
                          </p>
                          <p>{{ copy.decidedApprovedDetail }}</p>
                          <p class="statement-note">
                            {{ copy.decidedApprovedName }}
                            <a
                              [routerLink]="['/reviewer', d.id]"
                              [queryParams]="{ zone: 'in-flight' }"
                              >{{ copy.decidedApprovedLink }}</a
                            >
                          </p>
                        </section>
                      } @else {
                        <section
                          #statement
                          tabindex="-1"
                          class="statement inert"
                          role="status"
                        >
                          <p class="statement-title">
                            {{ copy.decidedRejectedHeading }}
                          </p>
                          <p>{{ copy.decidedRejectedDetail }}</p>
                          <p class="statement-note">
                            {{ copy.decidedRejectedNote }}
                          </p>
                        </section>
                      }
                    }
                  }
                  @case ('request-expired') {
                    <section
                      #statement
                      tabindex="-1"
                      class="statement pending"
                      role="alert"
                    >
                      <p class="statement-title">
                        {{ copy.decisionExpiredHeading }}
                      </p>
                      <p>{{ copy.decisionExpiredDetail }}</p>
                    </section>
                  }
                  @default {
                    <div class="decision-strip">
                      <div class="question">
                        <p>{{ copy.question }}</p>
                        <p class="hint">{{ copy.hint }}</p>
                      </div>
                      <div class="decision-buttons">
                        <button
                          class="btn btn-secondary btn-lg reject"
                          type="button"
                          (click)="startReject()"
                        >
                          {{ copy.reject }}
                        </button>
                        <button
                          class="btn btn-primary btn-lg approve"
                          type="button"
                          (click)="startApprove()"
                        >
                          {{ copy.approve }}
                        </button>
                      </div>
                    </div>
                  }
                }
              }
            </div>
          </article>

          @switch (decisionPhase().kind) {
            @case ('approve-confirm') {
              <!-- 11a, 14b: no name panel and no irreversibility line, by
                   decision; the strip beneath already says it cannot be undone,
                   and the statement after says whose name is on the release. -->
              <app-dialog
                labelledBy="approve-title"
                [width]="520"
                [dismissable]="!submitting()"
                (dismissed)="cancel()"
              >
                <h2 id="approve-title" class="dialog-title">
                  {{ approveDialogTitle(d) }}
                </h2>
                <dl class="rows compact">
                  <div>
                    <dt>{{ copy.request }}</dt>
                    <dd class="figure">{{ d.reference }}</dd>
                  </div>
                  <div>
                    <dt>{{ copy.workplace }}</dt>
                    <dd>{{ d.contact.workplace }}</dd>
                  </div>
                  <div>
                    <dt>{{ copy.askHeading }}</dt>
                    <dd>{{ askLine(d) }}</dd>
                  </div>
                </dl>
                @if (currentProblem(); as problem) {
                  <p class="problem" role="alert">{{ problemText(problem) }}</p>
                }
                <div class="pair-actions">
                  <button
                    class="btn btn-secondary"
                    type="button"
                    [disabled]="submitting()"
                    (click)="cancel()"
                  >
                    {{ copy.cancel }}
                  </button>
                  <button
                    class="btn btn-primary"
                    type="button"
                    data-autofocus
                    [attr.aria-busy]="submitting() || null"
                    (click)="confirmApprove(d.id)"
                  >
                    {{
                      submitting() ? copy.approveLoading : copy.approveConfirm
                    }}
                  </button>
                </div>
              </app-dialog>
            }
            @case ('reject-note') {
              <app-dialog
                labelledBy="reject-title"
                [width]="560"
                [dismissable]="!submitting()"
                (dismissed)="cancel()"
              >
                <h2 id="reject-title" class="dialog-title">
                  {{ rejectDialogTitle(d) }}
                </h2>
                <app-field
                  [label]="copy.rejectNoteLabel"
                  inputId="reject-note"
                  messageId="reject-note-hint"
                  [hint]="copy.rejectNoteHint"
                  [required]="true"
                >
                  <textarea
                    id="reject-note"
                    class="field-box note-box"
                    required
                    data-autofocus
                    aria-describedby="reject-note-hint"
                    [value]="noteText()"
                    (input)="onNoteInput($event)"
                  ></textarea>
                </app-field>
                <p class="autosave">{{ copy.rejectNoAutosave }}</p>
                @if (currentProblem(); as problem) {
                  <p class="problem" role="alert">{{ problemText(problem) }}</p>
                }
                <div class="pair-actions">
                  <button
                    class="btn btn-secondary"
                    type="button"
                    [disabled]="submitting()"
                    (click)="cancel()"
                  >
                    {{ copy.cancel }}
                  </button>
                  <button
                    class="btn btn-primary"
                    type="button"
                    [disabled]="!noteValid() && !submitting()"
                    [attr.aria-busy]="submitting() || null"
                    (click)="confirmReject(d.id)"
                  >
                    {{ submitting() ? copy.rejectLoading : copy.rejectSubmit }}
                  </button>
                </div>
              </app-dialog>
            }
          }
        }
      }
      @case ('gone') {
        <app-dossier-message [text]="copy.gone" />
      }
      @case ('failed') {
        <app-dossier-message [text]="copy.loadFailed" [announce]="true" />
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .codes summary {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 2px;
      font-size: 13px;
      color: var(--primary);
      cursor: pointer;
      list-style: none;
    }
    .codes summary::-webkit-details-marker {
      display: none;
    }
    .codes app-icon {
      transition: transform 0.1s;
    }
    .codes[open] app-icon {
      transform: rotate(90deg);
    }
    .codes p {
      margin-top: 4px;
      font-size: 13px;
      color: var(--muted-foreground);
    }
    .decision-slot .statement:focus {
      outline: none;
    }
    .decision-strip {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px 24px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
    }
    .question {
      flex: 1 1 320px;
      max-width: 640px;
      font-size: 14px;
    }
    .question .hint {
      margin-top: 2px;
      font-size: 12px;
      color: var(--muted-foreground);
    }
    .decision-buttons {
      display: flex;
      gap: 12px;
    }
    /* The one pair off the 1 : 1.2 grid: it shares its row with the question. */
    .reject {
      width: 180px;
    }
    .approve {
      width: 260px;
    }
    .dialog-title {
      font-size: 18px;
      font-weight: 600;
    }
    .dialog-title:focus {
      outline: none;
    }
    .note-box {
      height: auto;
      min-height: 112px;
      padding-top: 10px;
      padding-bottom: 10px;
      resize: vertical;
    }
    .autosave {
      padding: 12px 14px;
      font-size: 13px;
      color: var(--muted-foreground);
      background: var(--quiet);
      border: 1px solid var(--border);
      border-radius: var(--radius-panel);
    }
    .problem {
      color: var(--failed);
      font-weight: 600;
    }
  `,
})
export class DossierPage {
  private readonly api = inject(QueueApi);
  private readonly store = inject(QueueStore);
  private readonly injector = inject(Injector);
  private readonly statement = viewChild<ElementRef<HTMLElement>>('statement');

  protected readonly view = signal<View>({ kind: 'loading' });
  // The narrowed dossier, for the template: null while loading or once the
  // Request is gone or failed to load.
  protected readonly currentDossier = () => {
    const v = this.view();
    return v.kind === 'ok' ? v.dossier : null;
  };

  private asked = 0;

  protected readonly copy = {
    whoHeading: m.reviewer_dossier_requester_heading(),
    askHeading: m.reviewer_dossier_ask_heading(),
    workplace: m.requester_workplace(),
    group: m.reviewer_dossier_group(),
    dates: m.reviewer_dossier_dates(),
    datesInclusive: m.reviewer_dossier_dates_inclusive(),
    area: m.reviewer_dossier_area(),
    request: m.reviewer_col_request(),
    submitted: m.reviewer_submitted_label(),
    clock: m.reviewer_clock_label(),
    clockExpired: m.reviewer_clock_expired(),
    aheadLabel: m.reviewer_dossier_ahead_label(),
    probe: m.reviewer_probe_label(),
    probeNote: m.reviewer_probe_note(),
    probeFailedNote: m.reviewer_probe_failed_note(),
    expired: m.reviewer_dossier_expired(),
    gone: m.reviewer_dossier_gone(),
    loadFailed: m.reviewer_dossier_load_failed(),
    question: m.reviewer_decision_question(),
    hint: m.reviewer_decision_hint(),
    approve: m.reviewer_approve(),
    reject: m.reviewer_reject(),
    approveConfirm: m.reviewer_approve_confirm_submit(),
    approveLoading: m.reviewer_approve_loading(),
    cancel: m.reviewer_cancel(),
    rejectNoteLabel: m.reviewer_reject_note_prompt(),
    rejectNoteHint: m.reviewer_reject_note_hint(),
    rejectNoAutosave: m.reviewer_reject_no_autosave(),
    rejectSubmit: m.reviewer_reject_submit(),
    rejectLoading: m.reviewer_reject_loading(),
    decidedApprovedDetail: m.reviewer_decided_approved_detail(),
    decidedApprovedName: m.reviewer_decided_approved_name(),
    decidedApprovedLink: m.reviewer_decided_approved_link(),
    decidedRejectedHeading: m.reviewer_decided_rejected_heading(),
    decidedRejectedDetail: m.reviewer_decided_rejected_detail(),
    decidedRejectedNote: m.reviewer_decided_rejected_note(),
    decisionExpiredHeading: m.reviewer_decision_expired_heading(),
    decisionExpiredDetail: m.reviewer_decision_expired_detail(),
    decisionGone: m.reviewer_decision_gone(),
    decisionFailed: m.reviewer_decision_failed(),
    invalidNote: m.reviewer_reject_note_too_short(),
  };

  protected readonly decisionPhase = signal<DecisionPhase>({ kind: 'idle' });
  protected readonly noteText = signal('');
  protected readonly submitting = signal(false);

  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((params) => void this.load(params.get('id') ?? ''));
  }

  private async load(id: string): Promise<void> {
    // The last Request's contact details must not stay on screen under the next
    // Request's heading while it loads.
    this.view.set({ kind: 'loading' });
    // Nothing about a Decision carries across Requests — least of all a
    // half-typed internal note (§10.5).
    this.decisionPhase.set({ kind: 'idle' });
    this.noteText.set('');
    const asked = ++this.asked;
    const outcome = await this.api.dossier(id);
    if (asked !== this.asked) return; // the Reviewer has already moved on
    this.view.set(
      outcome.kind === 'ok'
        ? { kind: 'ok', dossier: outcome.dossier }
        : { kind: outcome.kind },
    );
    focusHeadingAfterRender(this.injector);
  }

  protected instant = formatInstant;
  protected timeLeft = formatDuration;

  /** Expired on arrival, or refused as too late while it was open (11e). */
  protected expiredNow = (d: Dossier) =>
    d.expired || this.decisionPhase().kind === 'request-expired';

  protected fullName = fullName;

  protected ahead(count: number | null): string {
    if (count === null) return '—';
    if (count === 0) return m.reviewer_dossier_ahead_none();
    return m.reviewer_dossier_ahead_count({ count });
  }

  protected rowCount(rowCount: Dossier['rowCount']): string {
    if (rowCount === 'pending') return m.reviewer_probe_pending();
    if (rowCount === 'failed') return m.reviewer_probe_failed();
    if (rowCount === 0) return m.reviewer_probe_zero();
    return m.reviewer_probe_rows({ count: ROW_COUNT_FORMAT.format(rowCount) });
  }

  protected codesDisclosure(count: number): string {
    return m.reviewer_dossier_codes_disclosure({ count });
  }

  protected areaLine = areaLine;

  /** The ask on one line, for the approve dialog. */
  protected askLine(d: Dossier): string {
    return [
      d.diseaseGroupName,
      dateRangeText(d.startDate, d.endDate),
      areaLine(d.area),
    ].join(' · ');
  }

  // --- The Decision (spec §10.3) ------------------------------------------

  protected startApprove(): void {
    this.decisionPhase.set({ kind: 'approve-confirm', problem: null });
  }

  protected startReject(): void {
    this.noteText.set('');
    this.decisionPhase.set({ kind: 'reject-note', problem: null });
  }

  protected cancel(): void {
    this.noteText.set('');
    this.decisionPhase.set({ kind: 'idle' });
  }

  protected onNoteInput(event: Event): void {
    this.noteText.set((event.target as HTMLTextAreaElement).value);
  }

  protected noteValid(): boolean {
    return this.noteText().trim().length >= MIN_NOTE_LENGTH;
  }

  protected approveDialogTitle(d: Dossier): string {
    return m.reviewer_approve_dialog_title({ name: fullName(d.contact) });
  }

  protected rejectDialogTitle(d: Dossier): string {
    return m.reviewer_reject_dialog_title({ name: fullName(d.contact) });
  }

  protected approvedHeading(decidedAt: string): string {
    return m.reviewer_decided_approved_heading({
      time: this.instant(decidedAt),
    });
  }

  protected currentProblem(): DecisionProblem | null {
    const phase = this.decisionPhase();
    return phase.kind === 'approve-confirm' || phase.kind === 'reject-note'
      ? phase.problem
      : null;
  }

  protected problemText(problem: DecisionProblem): string {
    switch (problem) {
      case 'gone':
        return this.copy.decisionGone;
      case 'invalid_note':
        return this.copy.invalidNote;
      case 'failed':
        return this.copy.decisionFailed;
    }
  }

  protected asRecorded() {
    const phase = this.decisionPhase();
    return phase.kind === 'recorded' ? phase : null;
  }

  protected async confirmApprove(id: string): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    try {
      const outcome = await this.api.approve(id);
      this.handleOutcome(id, outcome);
    } finally {
      this.submitting.set(false);
    }
  }

  protected async confirmReject(id: string): Promise<void> {
    if (this.submitting() || !this.noteValid()) return;
    const note = this.noteText();
    // Retyped, never persisted: cleared the instant it is sent (§10.5).
    this.noteText.set('');
    this.submitting.set(true);
    try {
      const outcome = await this.api.reject(id, note);
      this.handleOutcome(id, outcome);
    } finally {
      this.submitting.set(false);
    }
  }

  private handleOutcome(id: string, outcome: DecisionOutcome): void {
    switch (outcome.kind) {
      case 'recorded':
        // The Request leaves the pending list in this same response — never a
        // fresh GET, and never the next pending Request loaded in its place
        // (§10.3's warning against auto-advance).
        if (outcome.decision === 'approved') this.store.approvePending(id);
        else this.store.removePending(id);
        this.decisionPhase.set({
          kind: 'recorded',
          decision: outcome.decision,
          decidedAt: outcome.decidedAt,
        });
        this.focusStatement();
        return;
      case 'expired':
        this.store.markExpired(id);
        this.decisionPhase.set({ kind: 'request-expired' });
        this.focusStatement();
        return;
      case 'gone':
        this.store.removePending(id);
        this.setProblem('gone');
        return;
      case 'invalid_note':
        this.setProblem('invalid_note');
        return;
      case 'failed':
        this.setProblem('failed');
    }
  }

  /** The dialog and its trigger are gone: focus lands on what was recorded. */
  private focusStatement(): void {
    afterNextRender(() => this.statement()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  private setProblem(problem: DecisionProblem): void {
    const phase = this.decisionPhase();
    if (phase.kind === 'approve-confirm' || phase.kind === 'reject-note') {
      this.decisionPhase.set({ ...phase, problem });
    }
  }
}
