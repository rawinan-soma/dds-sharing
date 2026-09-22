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
import { Field } from './field';
import {
  type Area,
  type DecisionOutcome,
  type Dossier,
  type DossierOutcome,
  QueueApi,
} from './queue-api';
import { formatDuration, formatInstant } from './queue-format';
import { QueueStore } from './queue-store';
import { ReviewerSession } from './reviewer-session';

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

// The action area's own small state machine (§10.3): idle below the ask,
// naming the Reviewer before an approval, taking the mandatory note before a
// rejection, and finally the plain statement of what was recorded. Nothing
// here auto-advances to another Request (§10.3's warning) and nothing
// persists the note outside this component (§10.5).
type DecisionPhase =
  | { kind: 'idle' }
  | { kind: 'approve-confirm'; problem: DecisionProblem | null }
  | { kind: 'reject-note'; problem: DecisionProblem | null }
  | { kind: 'recorded'; decision: 'approved' | 'rejected'; decidedAt: string }
  | { kind: 'request-expired' };

type DecisionProblem = 'gone' | 'invalid_note' | 'failed';

// The review screen: read-only. It shows the five contact fields, the ask in
// human terms, the clock and the queue position, and only those (§10.2). The
// Approve and Reject buttons are the next slice's: they will sit BELOW all of
// this in the DOM as well as on screen, so the tab order says what the layout
// says, and they must not be floated or pinned.
@Component({
  selector: 'app-reviewer-dossier',
  imports: [Field],
  template: `
    @switch (view().kind) {
      @case ('ok') {
        @if (currentDossier(); as d) {
          <article class="dossier">
            <header>
              <h2 #heading tabindex="-1">{{ d.reference }}</h2>
              @if (d.expired) {
                <p class="expired" role="status">{{ copy.expired }}</p>
              } @else {
                <p class="ahead">{{ ahead(d.ahead) }}</p>
              }
            </header>

            <div class="ledger">
              <section aria-labelledby="who">
                <h3 id="who">{{ copy.whoHeading }}</h3>
                <dl>
                  <dt>{{ copy.firstName }}</dt>
                  <dd>{{ d.contact.name }}</dd>
                  <dt>{{ copy.lastName }}</dt>
                  <dd>{{ d.contact.surname }}</dd>
                  <dt>{{ copy.telephone }}</dt>
                  <dd>{{ d.contact.tel }}</dd>
                  <dt>{{ copy.email }}</dt>
                  <dd>{{ d.contact.email }}</dd>
                  <dt>{{ copy.workplace }}</dt>
                  <dd>{{ d.contact.workplace }}</dd>
                </dl>
              </section>

              <section aria-labelledby="ask">
                <h3 id="ask">{{ copy.askHeading }}</h3>
                <dl>
                  <dt>{{ copy.group }}</dt>
                  <dd>
                    {{ d.diseaseGroupName }}
                    <details>
                      <summary>
                        {{ codesDisclosure(d.reportCodes.length) }}
                      </summary>
                      <p class="codes figure">{{ d.reportCodes.join(', ') }}</p>
                    </details>
                  </dd>
                  <dt>{{ copy.dates }}</dt>
                  <dd>
                    <time [attr.datetime]="d.startDate">{{
                      day(d.startDate)
                    }}</time>
                    –
                    <time [attr.datetime]="d.endDate">{{
                      day(d.endDate)
                    }}</time>
                    <span class="muted">{{ copy.datesInclusive }}</span>
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

            <div class="strip">
              <div>
                <p class="cell-label">{{ copy.submitted }}</p>
                <p>
                  <time [attr.datetime]="d.submittedAt">{{
                    instant(d.submittedAt)
                  }}</time>
                </p>
              </div>
              <div>
                <p class="cell-label">{{ copy.clock }}</p>
                <p class="figure" [class.time-left]="!d.expired">
                  @if (d.expired) {
                    {{ copy.clockExpired }}
                  } @else {
                    {{ timeLeft(d.minutesLeft) }}
                  }
                </p>
                <p class="cell-note muted">{{ copy.clockNote }}</p>
              </div>
              <div>
                <p class="cell-label">{{ copy.probe }}</p>
                <p class="figure" [class.placeholder]="!isCounted(d.rowCount)">
                  @if (isCounted(d.rowCount)) {
                    {{ d.rowCount }}
                  } @else if (d.rowCount === 'pending') {
                    {{ copy.probePending }}
                  } @else {
                    {{ copy.probeFailed }}
                  }
                </p>
                <p class="cell-note muted">
                  {{
                    d.rowCount === 'failed'
                      ? copy.probeFailedNote
                      : copy.probeNote
                  }}
                </p>
              </div>
            </div>

            @if (!d.expired) {
              <div class="action-rule"></div>
              @switch (decisionPhase().kind) {
                @case ('recorded') {
                  @if (asRecorded(); as rec) {
                    <section class="decided" role="status" aria-live="polite">
                      @if (rec.decision === 'approved') {
                        <h3>{{ approvedHeading(rec.decidedAt) }}</h3>
                        <p>{{ copy.decidedApprovedDetail }}</p>
                      } @else {
                        <h3>{{ copy.decidedRejectedHeading }}</h3>
                        <p>{{ copy.decidedRejectedDetail }}</p>
                      }
                    </section>
                  }
                }
                @case ('request-expired') {
                  <section class="decided notice" role="alert">
                    <h3>{{ copy.decisionExpiredHeading }}</h3>
                    <p>{{ copy.decisionExpiredDetail }}</p>
                  </section>
                }
                @default {
                  <section class="actions">
                    <h3>{{ copy.judgementHeading }}</h3>
                    <p>{{ copy.judgementIdentity }}</p>
                    <p>{{ copy.judgementSize }}</p>
                    <p>{{ copy.judgementUncertainty }}</p>

                    @switch (decisionPhase().kind) {
                      @case ('idle') {
                        <div class="decision-buttons">
                          <button
                            class="btn btn-primary"
                            type="button"
                            (click)="startApprove()"
                          >
                            {{ copy.approve }}
                          </button>
                          <button
                            class="btn btn-secondary"
                            type="button"
                            (click)="startReject()"
                          >
                            {{ copy.reject }}
                          </button>
                        </div>
                        <p class="muted">{{ copy.decisionNote }}</p>
                      }
                      @case ('approve-confirm') {
                        <div class="confirm">
                          <p class="confirm-title">
                            {{ approveConfirmTitle(d.reference) }}
                          </p>
                          <p>{{ approveConfirmName() }}</p>
                          <p>{{ copy.approveConfirmPermanence }}</p>
                          <p>{{ copy.approveConfirmIrreversible }}</p>
                          @if (currentProblem(); as problem) {
                            <p class="problem" role="alert">
                              {{ problemText(problem) }}
                            </p>
                          }
                          <div class="confirm-actions">
                            <button
                              class="btn btn-primary"
                              type="button"
                              [disabled]="submitting()"
                              [attr.aria-busy]="submitting() || null"
                              (click)="confirmApprove(d.id)"
                            >
                              {{
                                submitting()
                                  ? copy.approveLoading
                                  : copy.approveConfirmSubmit
                              }}
                            </button>
                            <button
                              class="btn btn-quiet"
                              type="button"
                              [disabled]="submitting()"
                              (click)="cancel()"
                            >
                              {{ copy.cancel }}
                            </button>
                          </div>
                        </div>
                      }
                      @case ('reject-note') {
                        <div class="reject-form">
                          <p class="confirm-title">
                            {{ rejectTitle(d.reference) }}
                          </p>
                          <app-field
                            [label]="copy.rejectNotePrompt"
                            inputId="reject-note"
                          >
                            <textarea
                              id="reject-note"
                              class="field-box"
                              rows="4"
                              [value]="noteText()"
                              (input)="onNoteInput($event)"
                            ></textarea>
                          </app-field>
                          <p class="muted">
                            {{ copy.rejectNotePrivateHeading }}
                          </p>
                          <p class="muted">
                            {{ copy.rejectNotePrivateDetail }}
                          </p>
                          <p class="muted">{{ copy.rejectNoAutosave }}</p>
                          @if (currentProblem(); as problem) {
                            <p class="problem" role="alert">
                              {{ problemText(problem) }}
                            </p>
                          }
                          <div class="confirm-actions">
                            <button
                              class="btn btn-primary"
                              type="button"
                              [disabled]="!noteValid() || submitting()"
                              [attr.aria-busy]="submitting() || null"
                              (click)="confirmReject(d.id)"
                            >
                              {{
                                submitting()
                                  ? copy.rejectLoading
                                  : copy.rejectSubmit
                              }}
                            </button>
                            <button
                              class="btn btn-quiet"
                              type="button"
                              [disabled]="submitting()"
                              (click)="cancel()"
                            >
                              {{ copy.cancel }}
                            </button>
                          </div>
                        </div>
                      }
                    }
                  </section>
                }
              }
            }
          </article>
        }
      }
      @case ('gone') {
        <h2 #heading tabindex="-1" class="notice">{{ copy.gone }}</h2>
      }
      @case ('failed') {
        <h2 #heading tabindex="-1" class="notice" role="alert">
          {{ copy.loadFailed }}
        </h2>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 32px 40px;
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
    h3 {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--muted-foreground);
      margin-bottom: 12px;
    }
    header p {
      margin-top: 4px;
    }
    .expired {
      border-left: 2px solid var(--failed);
      padding-left: 16px;
      color: var(--failed);
    }
    .ledger {
      display: grid;
      gap: 32px 48px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-top: 32px;
    }
    dl {
      margin: 0;
    }
    dt {
      font-size: 0.875rem;
      color: var(--muted-foreground);
      margin-top: 12px;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .muted {
      display: block;
      color: var(--muted-foreground);
      font-size: 0.875rem;
    }
    summary {
      cursor: pointer;
      margin-top: 4px;
      color: var(--primary);
      font-size: 0.875rem;
    }
    .codes {
      margin-top: 4px;
      color: var(--muted-foreground);
    }
    .strip {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 24px;
      margin-top: 32px;
      padding: 16px 0;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }
    .cell-label {
      font-size: 0.875rem;
      color: var(--muted-foreground);
    }
    .cell-note {
      font-size: 0.8125rem;
    }
    .time-left {
      color: var(--pending);
      font-weight: 600;
    }
    /* Same size and slot as the counted state (handoff.md "Row count states"):
       a missing count must read as a fact, not a smaller, lesser answer. */
    .placeholder {
      font-size: 1.875rem;
      font-weight: 600;
      color: var(--inert);
    }
    /* Requirement, not styling: the decision area sits below everything a
       Reviewer must read first, in the DOM as well as on screen (spec §10.2). */
    .action-rule {
      margin-top: 32px;
      border-top: 1px solid var(--border-strong);
    }
    .actions,
    .decided {
      padding-top: 24px;
    }
    .actions p,
    .decided p {
      margin: 8px 0 0;
    }
    .decision-buttons {
      display: flex;
      gap: 12px;
      margin-top: 16px;
    }
    .confirm,
    .reject-form {
      margin-top: 16px;
      padding: 20px;
      background: var(--primary-wash);
      border-left: 2px solid var(--primary);
    }
    .confirm-title {
      font-weight: 600;
    }
    .confirm-actions {
      display: flex;
      gap: 12px;
      margin-top: 16px;
    }
    .problem {
      color: var(--failed);
      font-weight: 600;
    }
    .decided.notice {
      border-left: 2px solid var(--failed);
      padding-left: 16px;
    }
    .decided h3 {
      color: var(--foreground);
      font-size: 1.125rem;
      margin-bottom: 0;
    }
  `,
})
export class DossierPage {
  private readonly api = inject(QueueApi);
  private readonly store = inject(QueueStore);
  private readonly session = inject(ReviewerSession);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

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
    firstName: m.requester_first_name(),
    lastName: m.requester_last_name(),
    telephone: m.reviewer_dossier_telephone(),
    email: m.reviewer_dossier_email(),
    workplace: m.requester_workplace(),
    group: m.reviewer_dossier_group(),
    dates: m.reviewer_dossier_dates(),
    datesInclusive: m.reviewer_dossier_dates_inclusive(),
    area: m.reviewer_dossier_area(),
    submitted: m.reviewer_submitted_label(),
    clock: m.reviewer_clock_label(),
    clockNote: m.reviewer_clock_note(),
    clockExpired: m.reviewer_clock_expired(),
    probe: m.reviewer_probe_label(),
    probePending: m.reviewer_probe_pending(),
    probeFailed: m.reviewer_probe_failed(),
    probeNote: m.reviewer_probe_note(),
    probeFailedNote: m.reviewer_probe_failed_note(),
    expired: m.reviewer_dossier_expired(),
    gone: m.reviewer_dossier_gone(),
    loadFailed: m.reviewer_dossier_load_failed(),
    judgementHeading: m.reviewer_judgement_heading(),
    judgementIdentity: m.reviewer_judgement_identity(),
    judgementSize: m.reviewer_judgement_size(),
    judgementUncertainty: m.reviewer_judgement_uncertainty(),
    approve: m.reviewer_approve(),
    reject: m.reviewer_reject(),
    decisionNote: m.reviewer_decision_note(),
    approveConfirmPermanence: m.reviewer_approve_confirm_permanence(),
    approveConfirmIrreversible: m.reviewer_approve_confirm_irreversible(),
    approveConfirmSubmit: m.reviewer_approve_confirm_submit(),
    approveLoading: m.reviewer_approve_loading(),
    cancel: m.reviewer_cancel(),
    rejectNotePrompt: m.reviewer_reject_note_prompt(),
    rejectNotePrivateHeading: m.reviewer_reject_note_private_heading(),
    rejectNotePrivateDetail: m.reviewer_reject_note_private_detail(),
    rejectNoAutosave: m.reviewer_reject_no_autosave(),
    rejectSubmit: m.reviewer_reject_submit(),
    rejectLoading: m.reviewer_reject_loading(),
    decidedRejectedHeading: m.reviewer_decided_rejected_heading(),
    decidedRejectedDetail: m.reviewer_decided_rejected_detail(),
    decidedApprovedDetail: m.reviewer_decided_approved_detail(),
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
    // Selecting a Request moves focus to its heading, so a keyboard user lands
    // on what they picked rather than back in the list.
    afterNextRender(() => this.heading()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  protected day = formatDay;
  protected instant = formatInstant;
  protected timeLeft = formatDuration;

  protected ahead(count: number | null): string {
    if (count === null) return '';
    if (count === 0) return m.reviewer_dossier_ahead_none();
    if (count === 1) return m.reviewer_dossier_ahead_one();
    return m.reviewer_dossier_ahead({ count });
  }

  protected isCounted(rowCount: Dossier['rowCount']): rowCount is number {
    return typeof rowCount === 'number';
  }

  protected codesDisclosure(count: number): string {
    return m.reviewer_dossier_codes_disclosure({ count });
  }

  protected areaHeadline(area: Area): string {
    if (area.kind === 'national') return m.requester_area_national();
    return area.region === null
      ? this.areaProvinceNames(area)
      : m.requester_area_region_selected({ region: area.region });
  }

  // A named region shows the provinces it stands for beneath it; a hand-picked
  // list already is the provinces, so there is nothing to repeat under it.
  protected areaProvinces(area: Area): string | null {
    return area.kind === 'provinces' && area.region !== null
      ? this.areaProvinceNames(area)
      : null;
  }

  private areaProvinceNames(
    area: Extract<Area, { kind: 'provinces' }>,
  ): string {
    return area.provinces.map((p) => p.name).join(', ');
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

  protected approveConfirmTitle(reference: string): string {
    return m.reviewer_approve_confirm_title({ reference });
  }

  protected rejectTitle(reference: string): string {
    return m.reviewer_reject_title({ reference });
  }

  protected approveConfirmName(): string {
    return m.reviewer_approve_confirm_name({
      reviewer: this.session.current()?.displayName ?? '',
    });
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
        this.store.removePending(id);
        this.decisionPhase.set({
          kind: 'recorded',
          decision: outcome.decision,
          decidedAt: outcome.decidedAt,
        });
        return;
      case 'expired':
        this.decisionPhase.set({ kind: 'request-expired' });
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

  private setProblem(problem: DecisionProblem): void {
    const phase = this.decisionPhase();
    if (phase.kind === 'approve-confirm' || phase.kind === 'reject-note') {
      this.decisionPhase.set({ ...phase, problem });
    }
  }
}
